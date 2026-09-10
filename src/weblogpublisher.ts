import { App, MarkdownView, Notice, Plugin, TFile, TFolder, requestUrl, normalizePath, FuzzySuggestModal, Modal, ButtonComponent, parseYaml, stringifyYaml } from "obsidian";
import { CombinedSettings } from "./types";
import { WeblogFrontmatterModal, WeblogFrontmatterValues } from "./weblogfrontmattermodal";

// Shape of an entry as returned by GET /weblog/entries.
interface WeblogApiEntry {
  entry?: string;
  date?: string | number;
  metadata?: unknown;
  title?: string;
  body?: string;
  source?: string;
  status?: string;
  type?: string;
}

// Loosely-typed frontmatter fields used to pre-fill the "fix your frontmatter" prompt.
interface PromptFrontmatterInput {
  title?: string;
  date?: string;
  tags?: unknown;
  status?: string;
  type?: string;
}

export class WeblogPublisher {
  constructor(
    private app: App,
    private settings: CombinedSettings,
    private plugin: Plugin
  ) {
    if (this.settings.enableWeblog !== false) {
      this.addCommand();
    }
  }

  private addCommand() {
    this.plugin.addCommand({
      id: "publish-weblog-post",
      name: "Publish to Weblog",
      callback: () => this.publishCurrentNote(),
    });
    this.plugin.addCommand({
      id: "delete-weblog-post",
      name: "Delete Weblog Post/Page",
      callback: () => this.deleteCurrentPost(),
    });

    this.plugin.addCommand({
      id: "import-weblog-posts",
      name: "Import Weblog Posts from omg.lol",
      callback: () => this.importWeblogPosts(),
    });

  }

  public async publishCurrentNote() {
    if (!this.settings.enableWeblog) {
      new Notice("Weblog publishing is disabled in settings.");
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("No active markdown file.");
      return;
    }

    const file = view.file;
    const content = await this.app.vault.read(file);
    let metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

    // Fallback for iOS/mobile where the metadata cache (IDB) may be unavailable
    if (!metadata) {
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        try { metadata = parseYaml(fmMatch[1]); } catch { /* leave null */ }
      }
    }

    // If no frontmatter ask for the data needed to publish
    if (!metadata) {
      this.promptForFrontmatter(file, content);
      return;
    }

    // If frontmatter exists but status is invalid ask
    const statusValue = metadata.status?.toLowerCase();
    if (statusValue !== "published" && statusValue !== "draft") {
      this.promptForFrontmatter(file, content, metadata);
      return;
    }

    const status = metadata.status?.toLowerCase();
    if (status !== "published" && status !== "draft") {
      new Notice("Note frontmatter must include `status: published` or `draft`.");
      return;
    }
    
    const wasUpdate = Boolean(metadata.entry);

    const frontmatterTitle = metadata.title?.trim() ?? "";
    const useTitle = frontmatterTitle.length > 0 ? frontmatterTitle : "";

    let slug = metadata.slug?.trim();
    if (!slug || slug === "undefined") {
      slug = this.getEffectiveSlug(frontmatterTitle, content, file.name);
    }

    const date = metadata.date?.trim() || new Date().toISOString();
    const entryId = metadata.entry;

    const tagsArray = metadata.tags ?? [];
    const tagsLine = Array.isArray(tagsArray) && tagsArray.length > 0
      ? `Tags: ${tagsArray.join(", ")}\n`
      : "";

    // Optional fields for Type, Status, and Template
    const type = metadata.type?.trim();
    const validTypeLine = type && type.toLowerCase() !== "post" ? `Type: ${type}\n` : "";

    const apiStatus = metadata.status?.trim();
    const statusLine = apiStatus ? `Status: ${apiStatus}\n` : "";

    const templateKey = Object.keys(metadata).find((k: string) => k.toLowerCase() === "template");
    const template = templateKey ? String(metadata[templateKey]).trim() : undefined;
    const templateLine = template ? `Template: ${template}\n` : "";

    const rawBody = this.stripFrontmatter(content);
    const pathFormat = await this.getPostPathFormat();
    const { resolved: bodyContent, unresolvedPublished } = this.resolveWikilinks(rawBody, file.path, pathFormat);
    const imageEmbeds = this.detectImageEmbeds(bodyContent);

    if (unresolvedPublished.length > 0 || imageEmbeds.length > 0) {
      const proceed = await this.warnAndConfirm(unresolvedPublished, imageEmbeds);
      if (!proceed) return;
    }

    const titleLine = useTitle.length > 0 ? `Title: ${useTitle}\n` : "";
    const extraLines = this.buildExtraMetadataLines(metadata);

    const fullPost = `${titleLine}Slug: ${slug}\n${extraLines}Date: ${date}\n${validTypeLine}${statusLine}${templateLine}${tagsLine}\n${bodyContent}`;

    const endpoint = entryId
      ? `https://api.omg.lol/address/${this.settings.username}/weblog/entry/${entryId}`
      : `https://api.omg.lol/address/${this.settings.username}/weblog/entry`;

    try {
      const response = await requestUrl({
        method: "POST",
        url: endpoint,
        headers: {
          Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
          "Content-Type": "text/plain",
        },
        body: fullPost,
      });

      const result = response.json;
      const entry = result?.response?.entry;
      if (entry) {
        const returnedSlug = entry.slug || slug;
        await this.injectOrUpdateFrontmatter(file, entry.entry, returnedSlug);

        // Respect page-type + renamePages toggle
        const isPage =
          typeof metadata.type === "string" &&
          metadata.type.toLowerCase() === "page";
        const allowRename =
          this.settings.enableRenaming && (!isPage || this.settings.renamePages);

        const safeDate = this.getSafeDate(date);
        if (allowRename) {
          await this.renameFileWithSlug(file, safeDate, returnedSlug);
        }
        await this.moveFileToDateFolder(file, safeDate, isPage);
// THIS SHOULD BE CHANGED
//        new Notice(entryId ? "🔁 Weblog post updated." : "✅ Weblog post published.");
        const isDraft = status === "draft";

        let message = "";

        if (isDraft) {
          message = wasUpdate
            ? "📝 Weblog draft updated."
            : "📝 Draft saved to weblog (not public).";
        } else {
          message = wasUpdate
            ? "🔁 Weblog post updated."
            : "✅ Weblog post published.";
        }

        new Notice(message);

      } else {
        throw new Error("Response missing 'entry' data.");
      }
    } catch (error) {
      console.error("Error publishing post:", error);
      new Notice("❌ Failed to publish weblog post.");
    }
  }

  // Publishes a single file (used by batchPublish)
    public async publishFile(file: TFile, pathFormat?: string) {
      const content = await this.app.vault.read(file);
      const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

      if (!metadata || metadata.status?.toLowerCase() !== "published") return;


      const slug = metadata.slug?.trim() ||
        this.getEffectiveSlug(metadata.title, content, file.name);
      const date = metadata.date?.trim() || new Date().toISOString();
      const entryId = metadata.entry;


      const tagsArray = metadata.tags ?? [];
      const tagsLine = Array.isArray(tagsArray) && tagsArray.length > 0
        ? `Tags: ${tagsArray.join(", ")}\n`
        : "";

      const type = metadata.type?.trim();
      const validTypeLine = type && type.toLowerCase() !== "post"
        ? `Type: ${type}\n`
        : "";
      const apiStatus = metadata.status?.trim();
      const statusLine = apiStatus ? `Status: ${apiStatus}\n` : "";

      const templateKey = Object.keys(metadata).find((k: string) => k.toLowerCase() === "template");
      const template = templateKey ? String(metadata[templateKey]).trim() : undefined;
      const templateLine = template ? `Template: ${template}\n` : "";

      const rawBody = this.stripFrontmatter(content);
      const resolvedPathFormat = pathFormat ?? await this.getPostPathFormat();
      const { resolved: bodyContent } = this.resolveWikilinks(rawBody, file.path, resolvedPathFormat);
      const titleLine = metadata.title?.trim()
        ? `Title: ${metadata.title.trim()}\n`
        : "";
      const extraLines = this.buildExtraMetadataLines(metadata);

      const fullPost = `${titleLine}Slug: ${slug}\n${extraLines}Date: ${date}\n${validTypeLine}${statusLine}${templateLine}${tagsLine}\n${bodyContent}`;
      const endpoint = entryId
        ? `https://api.omg.lol/address/${this.settings.username}/weblog/entry/${entryId}`
        : `https://api.omg.lol/address/${this.settings.username}/weblog/entry`;

      try {
        const response = await requestUrl({
          method: "POST",
          url: endpoint,
          headers: {
            Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
            "Content-Type": "text/plain",
          },
          body: fullPost,
        });

        const result = response.json;
        const entry = result?.response?.entry;
        if (entry) {
          const returnedSlug = entry.slug || slug;
          await this.injectOrUpdateFrontmatter(file, entry.entry, returnedSlug);

          const isPage = type?.toLowerCase() === "page";
          await this.moveFileToDateFolder(file, this.getSafeDate(date), isPage);

          new Notice(entryId ? "🔁 Weblog post updated." : "✅ Weblog post published.");

        } else {
          throw new Error("Response missing entry data.");
        }
      } catch (error) {
        console.error("Error publishing:", error);
        new Notice(`❌ Failed to publish ${file.name}`);
      }
    }
  
    public async importWeblogPosts() {
    if (!this.settings.enableWeblog) {
      new Notice("Weblog publishing is disabled in settings.");
      return;
    }

    let basePath =
      this.settings.weblogImportPath?.trim() ||
      this.settings.autoOrganizeBasePath?.trim() ||
      "";

    if (!basePath) {
      const prompted = await this.promptForImportPath();
      if (!prompted) return;
      basePath = prompted;
    }
    basePath = basePath.replace(/\/$/, "");

    let entries: WeblogApiEntry[];
    try {
      const response = await requestUrl({
        method: "GET",
        url: `https://api.omg.lol/address/${this.settings.username}/weblog/entries`,
        headers: {
          Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
        },
      });
      entries = response.json?.response?.entries ?? [];
    } catch (error) {
      console.error("Error fetching weblog entries:", error);
      new Notice("❌ Failed to fetch weblog entries.");
      return;
    }

    if (!entries.length) {
      new Notice("No weblog entries found.");
      return;
    }

    // Collect existing entry IDs to skip duplicates
    const existingEntries = new Set<string>();
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (!(f instanceof TFile) || f.extension !== "md") continue;
      const fm = this.app.metadataCache.getCache(f.path)?.frontmatter;
      if (fm?.entry) existingEntries.add(String(fm.entry));
    }

    let imported = 0;
    let skipped = 0;

    for (const entry of entries) {
      const entryId = String(entry.entry ?? "");
      if (!entryId) continue;

      if (existingEntries.has(entryId)) {
        skipped++;
        continue;
      }

      const dateStr = entry.date
        ? new Date(Number(entry.date) * 1000).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const entryMetadata = this.parseEntryMetadata(entry.metadata);
      const slug = entryMetadata.slug ?? this.slugify(entry.title ?? entryId);
      const title: string = entry.title ?? "";
      const body: string = entry.body ?? "";

      const tagsMatch = (entry.source ?? "").match(/^Tags:\s*(.+)$/m);
      const tags: string[] = tagsMatch
        ? tagsMatch[1].split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];

      const rawStatus = (entry.status ?? "").toLowerCase();
      const status = rawStatus === "live" ? "published" : rawStatus === "draft" ? "draft" : "draft";

      const isPage = (entry.type ?? "").toLowerCase() === "page";

      const fm: Record<string, unknown> = { entry: entryId, slug, title, date: dateStr, status };
      if (isPage) fm.type = "page";
      if (tags.length) fm.tags = tags;

      // Pull back any custom metadata (e.g. Modified, Description) that isn't
      // one of the fields already represented above.
      const reservedMetadataKeys = new Set(["slug", "date"]);
      for (const key of Object.keys(entryMetadata)) {
        if (reservedMetadataKeys.has(key.toLowerCase())) continue;
        const value = entryMetadata[key];
        if (value === null || value === undefined || value === "") continue;
        fm[key] = value;
      }

      const fileContent = `---\n${stringifyYaml(fm).trim()}\n---\n\n${body}`;

      let targetFolder: string;
      let filename: string;

      if (isPage) {
        targetFolder = normalizePath(`${basePath}/pages`);
        filename = `${slug}.md`;
      } else {
        const [year, month] = dateStr.split("-");
        targetFolder = normalizePath(`${basePath}/posts/${year}/${month}`);
        filename = this.settings.enableRenaming
          ? `${dateStr}_${slug}.md`
          : `${slug}.md`;
      }

      const targetPath = normalizePath(`${targetFolder}/${filename}`);

      if (this.app.vault.getAbstractFileByPath(targetPath)) {
        skipped++;
        continue;
      }

      if (!this.app.vault.getAbstractFileByPath(targetFolder)) {
        await this.app.vault.createFolder(targetFolder);
      }

      await this.app.vault.create(targetPath, fileContent);
      imported++;
    }

    new Notice(`✅ Import complete. ${imported} imported, ${skipped} skipped.`);
  }

  private promptForImportPath(): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText("Import Destination");
      modal.contentEl.createEl("p", {
        text: "Enter the base folder path for imported posts (yyyy/mm subfolders will be created automatically):",
      });

      const input = modal.contentEl.createEl("input", { type: "text" });
      input.placeholder = "weblog/posts";
      input.style.width = "100%";
      input.style.marginBottom = "1em";

      const buttonRow = modal.contentEl.createDiv({ cls: "modal-button-container" });

      new ButtonComponent(buttonRow)
        .setButtonText("Cancel")
        .onClick(() => { modal.close(); resolve(null); });

      new ButtonComponent(buttonRow)
        .setButtonText("Import")
        .setCta()
        .onClick(() => {
          const val = input.value.trim();
          modal.close();
          resolve(val || null);
        });

      modal.open();
      window.setTimeout(() => input.focus(), 50);
    });
  }

  public async batchPublish() {
      // Get list of folders
      const folders = this.app.vault
        .getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder)
        .map((f) => f.path)
        .filter((p) => !p.startsWith(".")); // skip hidden folders

      if (folders.length === 0) {
        new Notice("No folders found in vault.");
        return;
      }

    // Select a folder to publish
    const selectedFolder = await new Promise<string | null>((resolve) => {
      class FolderSelectModal extends FuzzySuggestModal<string> {
        folders: string[];

        constructor(app: App, folders: string[]) {
          super(app);
          this.folders = folders;
        }

        getItems(): string[] {
          return this.folders;
        }

        getItemText(item: string): string {
          return item;
        }

        onChooseItem(item: string, _evt: MouseEvent | KeyboardEvent): void {
          // Resolve immediately when item chosen
          resolve(item);
          // Close the modal cleanly after resolving
          this.close();
        }

        onClose(): void {
          // Only resolve null if user closed manually (no selection)
          window.setTimeout(() => resolve(null), 10);
        }
      }

      const modal = new FolderSelectModal(this.app, folders);
      modal.setPlaceholder("Select folder to batch publish");
      modal.open();
    });


      // exit if canceled
      if (!selectedFolder) {
        new Notice("Batch publish canceled — no folder selected.");
        return;
      }

      // Get the chosen folder object
      const folder = this.app.vault.getAbstractFileByPath(selectedFolder);
      if (!(folder instanceof TFolder)) {
        new Notice(`⚠️ Folder "${selectedFolder}" not found.`);
        return;
      }

      // Recursive helper to walk through subfolders
      const collectMarkdownFiles = (dir: TFolder): TFile[] => {
        let files: TFile[] = [];
        for (const child of dir.children) {
          if (child instanceof TFile && child.extension === "md") files.push(child);
          else if (child instanceof TFolder) files = files.concat(collectMarkdownFiles(child));
        }
        return files;
      };

      const markdownFiles = collectMarkdownFiles(folder);

      if (markdownFiles.length === 0) {
        new Notice(`No Markdown files found in "${selectedFolder}".`);
        return;
      }

      new Notice(`Starting batch publish (${markdownFiles.length} files)…`);
      let publishedCount = 0;
      const batchPathFormat = await this.getPostPathFormat();

      for (const file of markdownFiles) {
        try {
          const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;
          if (metadata?.status?.toLowerCase() === "published") {
            await this.publishFile(file, batchPathFormat);
            publishedCount++;
          }
        } catch (err) {
          console.error(`❌ Error publishing ${file.name}:`, err);
          new Notice(`❌ Failed: ${file.name}`);
        }
      }

      new Notice(`✅ Batch publish complete. ${publishedCount} posts processed.`);
    }


  private getEffectiveSlug(title: string, content: string, fallbackFilename: string): string {
    const useTitle = title?.trim();
    let source: string;

    if (useTitle?.length) {
      source = useTitle;
    } else {
      const body = this.stripFrontmatter(content);
      const firstLine = body.split("\n").find(line => line.trim().length > 0);
      source = firstLine ?? this.extractTitleFromFilename(fallbackFilename);
    }

    return this.slugify(source);
  }

  private slugify(input: string): string {
    // 1. Replace Obsidian wikilinks with their display text: [[file|alias]] → alias,
    //    [[file#heading]] → file. Image embeds (![[...]]) carry no useful slug text, drop them.
    let cleaned = input.replace(
      /(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
      (_m, bang, target, alias) => (bang ? "" : (alias ?? target).replace(/\.md$/i, "").trim())
    );

    // 2. Replace Markdown links with their text: [text](url) → text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // 3. Replace HTML links with their inner text: <a href="...">text</a> → text
    cleaned = cleaned.replace(/<a\s+[^>]*href=["'][^"']*["'][^>]*>(.*?)<\/a>/gi, "$1");

    // 4. Remove bare URLs (http/https)
    cleaned = cleaned.replace(/https?:\/\/\S+/g, "");

    // 5. Clean and extract words
    const words = cleaned
      .replace(/['"-]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .toLowerCase()
      .match(/\b\w+\b/g) || [];

    return words.slice(0, this.settings.slugWordCount).join("-");
  }

  private extractTitleFromFilename(filename: string): string {
    const name = filename.replace(/\.md$/, "");
    const parts = name.split("_");
    return parts.slice(1).join(" ") || name;
  }

  private stripFrontmatter(content: string): string {
    const match = content.match(/^---\n([\s\S]*?)\n---\n*/);
    return match ? content.substring(match[0].length).trim() : content.trim();
  }

  // Reserved keys are already emitted as their own dedicated lines above.
  // Anything else in frontmatter (e.g. Modified, Description) gets passed
  // through to the API so it lands in the entry's metadata section.
  private readonly reservedFrontmatterKeys = new Set([
    "title", "slug", "date", "type", "status", "template", "tags", "entry",
  ]);

  // The API has been observed returning entry.metadata as either a parsed
  // object or a JSON-encoded string, depending on endpoint — normalize both.
  private parseEntryMetadata(metadata: unknown): Record<string, unknown> {
    if (!metadata) return {};
    if (typeof metadata === "string") {
      try {
        const parsed = JSON.parse(metadata);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }
    return typeof metadata === "object" ? { ...metadata } : {};
  }

  private buildExtraMetadataLines(metadata: Record<string, unknown>): string {
    let lines = "";
    for (const key of Object.keys(metadata)) {
      if (this.reservedFrontmatterKeys.has(key.toLowerCase())) continue;

      const value = metadata[key];
      if (value === null || value === undefined || value === "") continue;

      const formatted = Array.isArray(value)
        ? value.join(", ")
        : String(value).trim();
      if (!formatted) continue;

      const label = key.charAt(0).toUpperCase() + key.slice(1);
      lines += `${label}: ${formatted}\n`;
    }
    return lines;
  }

// Added this to help perserve existing Frontmatter
  private async injectOrUpdateFrontmatter(file: TFile, entryId: string, slug: string) {
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.entry = entryId;
        if (slug && slug.trim().length) fm.slug = slug.trim();
        else delete fm.slug;
      });
    } catch {
      // Fallback for iOS where processFrontMatter may fail due to IDB unavailability
      try {
        const raw = await this.app.vault.read(file);
        const fmRegex = /^---\n([\s\S]*?)\n---\n?/;
        const match = raw.match(fmRegex);
        if (!match) return;
        const fm = parseYaml(match[1]) || {};
        fm.entry = entryId;
        if (slug && slug.trim().length) fm.slug = slug.trim();
        else delete fm.slug;
        const newFm = `---\n${stringifyYaml(fm).trim()}\n---\n\n`;
        await this.app.vault.modify(file, raw.replace(fmRegex, newFm));
      } catch { /* best effort */ }
    }
  }

  private getSafeDate(date: string | undefined): string {
    if (!date) {
      return new Date().toISOString().split("T")[0]; // fallback to today
    }
    if (date.includes("T")) {
      return date.split("T")[0];
    }
    if (date.includes(" ")) {
      return date.split(" ")[0];
    }
    return date.replace(/[:\\/]/g, "").trim();
  }

  private async renameFileWithSlug(file: TFile, date: string, slug: string) {
    if (!this.settings.enableRenaming) return;

    const parsedDate = this.getSafeDate(date);
    const safeSlug = slug.replace(/[\\/:]/g, "-");

    const newName = `${parsedDate}_${safeSlug}.md`;
    const newPath = normalizePath(file.path.replace(file.name, newName));

    if (newPath !== file.path) {
      await this.app.fileManager.renameFile(file, newPath);
    }
  }

  private promptForFrontmatter(file: TFile, _content: string, metadata?: PromptFrontmatterInput) {
    const existing: Partial<WeblogFrontmatterValues & { type?: string }> = {
      title: metadata?.title,
      date: metadata?.date,
      tags: Array.isArray(metadata?.tags) ? (metadata?.tags as string[]) : [],
      status: metadata?.status as WeblogFrontmatterValues["status"] | undefined,
      type: metadata?.type,
    };

// Fix for existing Frontmatter
    new WeblogFrontmatterModal(this.app, async (values) => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        // Only set what your plugin owns
        if (values.title?.trim()) fm.title = values.title.trim();
        else delete fm.title;

        fm.date = values.date.trim();
        fm.status = values.status;
        if (values.isPage) fm.type = "page";
        else delete fm.type;

        if (values.tags?.length) fm.tags = values.tags;
        else delete fm.tags;
      });

      window.setTimeout(() => { void this.publishCurrentNote(); }, 300);
    }, existing).open();
  }

  // ===== Delete Logic =====
  private async deleteCurrentPost() {
    if (!this.settings.enableWeblog) {
      new Notice("Weblog publishing is disabled in settings.");
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("No active markdown file.");
      return;
    }

    const file = view.file;
    const metadata = this.app.metadataCache.getCache(file.path)?.frontmatter;

    if (!metadata || !metadata.entry) {
      new Notice("This post has not been published yet.");
      return;
    }

    const entry = metadata.entry;
    const title = metadata.title ?? file.basename;

    const confirmed = await this.confirmDelete(
      `This will permanently delete the weblog post/page "${title}".`
    );

    if (!confirmed) return;

    try {
      const response = await requestUrl({
        method: "DELETE",
        url: `https://api.omg.lol/address/${this.settings.username}/weblog/delete/${entry}`,
        headers: {
          Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
        },
      });

      if (!response.json?.request?.success) {
        throw new Error(
          response.json?.response?.message || "Delete failed"
        );
      }

      // clean up entry information and make a draft
      await this.detachWeblogEntry(file);

      new Notice("🗑️ Weblog post/page deleted.");
    } catch (error) {
      console.error("Error deleting weblog post:", error);
      new Notice("❌ Failed to delete weblog post.");
    }
  }

  private async detachWeblogEntry(file: TFile) {
    const content = await this.app.vault.read(file);

    const updated = content.replace(
      /^---([\s\S]*?)---/,
      (_, yamlBlock) => {
        const lines = yamlBlock.trim().split("\n");

        const cleaned: string[] = [];
        let hasStatus = false;

        for (const line of lines) {
          if (line.startsWith("entry:")) continue;

          if (line.startsWith("status:")) {
            cleaned.push("status: draft");
            hasStatus = true;
            continue;
          }

          cleaned.push(line);
        }

        // If status was missing entirely, add it
        if (!hasStatus) {
          cleaned.push("status: draft");
        }

        return `---\n${cleaned.join("\n")}\n---`;
      }
    );

    await this.app.vault.modify(file, updated);
  }


private resolveWikilinks(body: string, sourceFilePath: string, pathFormat: string): {
  resolved: string;
  unresolvedPublished: string[];
} {
  const unresolvedPublished: string[] = [];
  // Match [[file]], [[file|alias]], [[file#heading]], [[file#heading|alias]]
  // Negative lookbehind excludes ![[...]] image embeds
  const wikilinkRegex = /(?<!!)\[\[([^\]#|]+)(?:#[^\]|]*)?\|?([^\]]*)\]\]/g;

  const resolved = body.replace(wikilinkRegex, (_match, filename, alias) => {
    const name = filename.trim();
    const displayText = alias?.trim() || name;

    const file = this.app.metadataCache.getFirstLinkpathDest(name, sourceFilePath);
    if (!file) return displayText;

    const fm = this.app.metadataCache.getCache(file.path)?.frontmatter;
    const slug = fm?.slug?.trim();

    if (slug) {
      const base = this.settings.weblogBaseUrl?.trim()
        || `https://${this.settings.username}.weblog.lol`;
      const isPage = fm?.type?.toLowerCase() === "page";
      const datePath = !isPage && fm?.date ? this.applyPhpDateFormat(pathFormat, String(fm.date)) : "";
      const url = this.joinUrlSegments(base, datePath, slug);
      return `[${displayText}](${url})`;
    }

    if (fm?.paste_url) {
      const customBase = this.settings.pastebinBaseUrl?.trim();
      const url = customBase && fm?.paste_id
        ? `${customBase}/${fm.paste_id}`
        : fm.paste_url;
      return `[${displayText}](${url})`;
    }

    if (fm?.status?.toLowerCase() === "published") {
      unresolvedPublished.push(displayText);
    }

    return displayText;
  });

  return { resolved, unresolvedPublished };
}

private async getPostPathFormat(): Promise<string> {
  const defaultFormat = "/Y/m/d/";

  // 0. An explicit override always wins and skips the vault/API lookups below.
  const override = this.settings.weblogPathFormatOverride?.trim();
  if (override) return override;

  // 1. Check vault for a weblog configuration note
  const configFile = this.app.vault.getAllLoadedFiles().find((f): f is TFile => {
    if (!(f instanceof TFile)) return false;
    const fm = this.app.metadataCache.getCache(f.path)?.frontmatter;
    return fm?.type === "weblog" && fm?.entry === "configuration";
  });

  if (configFile) {
    try {
      const content = await this.app.vault.read(configFile);
      const match = content.match(/^Post path format:\s*(.+)$/m);
      if (match?.[1]?.trim()) return match[1].trim();
    } catch {
      // fall through
    }
  }

  // 2. Fetch from API if not found in vault
  try {
    const format = await this.fetchPostPathFormatFromApi();
    if (format) return format;
  } catch {
    // fall through to default
  }

  return defaultFormat;
}

// Also used by the settings tab's "Verify against omg.lol" button, so it's public.
// The /weblog/configuration endpoint returns `configuration` as an object
// ({ object, json, raw }), not a plain string — earlier code treated it as a
// string and called .match() on it, which threw and was silently swallowed,
// so this lookup always fell back to the hardcoded default.
public async fetchPostPathFormatFromApi(): Promise<string | null> {
  const resp = await requestUrl({
    method: "GET",
    url: `https://api.omg.lol/address/${this.settings.username}/weblog/configuration`,
    headers: {
      Authorization: `Bearer ${this.settings.apiToken || this.settings.token}`,
    },
  });

  const configuration = resp.json?.response?.configuration;

  const fromObject = configuration?.object?.["post-path-format"];
  if (typeof fromObject === "string" && fromObject.trim()) return fromObject.trim();

  // Defensive fallback in case the API's shape ever changes.
  const raw: string = typeof configuration === "string" ? configuration : configuration?.raw ?? "";
  const match = raw.match(/^Post path format:\s*(.+)$/m);
  return match?.[1]?.trim() || null;
}

// Joins a base URL with any number of path segments using a single slash
// between each, regardless of leading/trailing slashes already present —
// so a flat/empty format (e.g. "/") can't produce a doubled "//" in the URL.
private joinUrlSegments(base: string, ...segments: string[]): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const parts = segments
    .map(s => s.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return [trimmedBase, ...parts].join("/");
}

private applyPhpDateFormat(format: string, dateStr: string): string {
  const safeDate = this.getSafeDate(dateStr);
  if (!safeDate.match(/^\d{4}-\d{2}-\d{2}$/)) return "";

  const [year, month, day] = safeDate.split("-");

  return format
    .replace(/Y/g, year)
    .replace(/y/g, year.slice(2))
    .replace(/m/g, month)
    .replace(/n/g, String(parseInt(month)))
    .replace(/d/g, day)
    .replace(/j/g, String(parseInt(day)));
}

private detectImageEmbeds(body: string): string[] {
  return [...body.matchAll(/!\[\[([^\]]+)\]\]/g)].map(m => m[1]);
}

private async warnAndConfirm(unresolvedLinks: string[], imageEmbeds: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(this.app);
    modal.titleEl.setText("Publishing Warnings");

    if (unresolvedLinks.length > 0) {
      modal.contentEl.createEl("p", {
        text: `${unresolvedLinks.length} link(s) point to notes marked as published but not yet pushed — they'll appear as plain text:`,
      });
      const ul = modal.contentEl.createEl("ul");
      for (const link of unresolvedLinks) {
        ul.createEl("li", { text: link });
      }
    }

    if (imageEmbeds.length > 0) {
      modal.contentEl.createEl("p", {
        text: `${imageEmbeds.length} image embed(s) haven't been uploaded — they won't display on your weblog:`,
      });
      const ul = modal.contentEl.createEl("ul");
      for (const img of imageEmbeds) {
        ul.createEl("li", { text: img });
      }
    }

    modal.contentEl.createEl("p", { text: "Cancel to fix first, or publish anyway?" });

    const buttonRow = modal.contentEl.createDiv({ cls: "modal-button-container" });

    new ButtonComponent(buttonRow)
      .setButtonText("Cancel")
      .onClick(() => { modal.close(); resolve(false); });

    new ButtonComponent(buttonRow)
      .setButtonText("Publish Anyway")
      .setCta()
      .onClick(() => { modal.close(); resolve(true); });

    modal.open();
  });
}

private async moveFileToDateFolder(file: TFile, date: string, isPage: boolean) {
  if (!this.settings.enableAutoOrganize || !this.settings.autoOrganizeBasePath || isPage) return;
  if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return;

  const [year, month] = date.split("-");
  const base = this.settings.autoOrganizeBasePath.replace(/\/$/, "");
  const targetFolder = normalizePath(`${base}/${year}/${month}`);
  const targetPath = normalizePath(`${targetFolder}/${file.name}`);

  if (normalizePath(file.path) === targetPath) return;

  if (!this.app.vault.getAbstractFileByPath(targetFolder)) {
    await this.app.vault.createFolder(targetFolder);
  }

  await this.app.fileManager.renameFile(file, targetPath);
}

private async confirmDelete(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(this.app);
    modal.modalEl.addClass("omg-confirm-modal");

    modal.titleEl.setText("Confirm Delete");

    modal.contentEl.createEl("p", { text: message });
    modal.contentEl.createEl("p", {
      text: "This action has no undo. Continue?",
    });

    const buttonRow = modal.contentEl.createDiv({
      cls: "modal-button-container",
    });

    new ButtonComponent(buttonRow)
      .setButtonText("Cancel")
      .onClick(() => {
        modal.close();
        resolve(false);
      });

    new ButtonComponent(buttonRow)
      .setButtonText("Delete")
      .setCta()
      .onClick(() => {
        modal.close();
        resolve(true);
      });

    modal.open();
  });
}


}
