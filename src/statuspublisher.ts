import { App, Notice, TFile, requestUrl, moment as obsidianMoment, normalizePath } from "obsidian";
import { CombinedSettings } from "./types";
import { OmglolPublish } from "./main";
import GraphemeSplitter from "grapheme-splitter";
import { getDailyNote, createDailyNote, getAllDailyNotes } from "obsidian-daily-notes-interface";
import { StatusPostModal } from "./statuspostmodal";

// Obsidian bundles moment and exports the value, but its type loses its call
// signature through the re-export — cast back to the real (type-only) shape.
const moment = obsidianMoment as unknown as typeof import("moment");


export class StatusPublisher {
  constructor(
    private app: App,
    private settings: CombinedSettings,
    private plugin: OmglolPublish
  ) {
    if (this.settings.enableStatusPoster !== false) {
      this.addCommand();
    }
  }

  private addCommand() {
    this.plugin.addCommand({
      id: "post-status-lol",
      name: "Post to status.lol",
      callback: () => this.showStatusModal(),
    });
  }

  public showStatusModal() {
    if (!this.settings.enableStatusPoster) {
      new Notice("Status.lol posting is disabled in settings.");
      return;
    }

    const defaultSkip = this.settings.skip_mastodon_post ?? true;

    new StatusPostModal(
      this.app,
      this.plugin,
      this.settings,
      (status: string, skipMasto: boolean) => {
        this.postStatus(status, skipMasto);
      },
      defaultSkip // ← new argument
    ).open();
  }

  private async postStatus(text: string, skipMastodon: boolean) {
    const payload = this.getDataToPost(text, skipMastodon);

    try {
      const res = await requestUrl({
        url: `https://api.omg.lol/address/${this.settings.username}/statuses/`,
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + this.settings.token,
        },
      });

      const response = res.json.response;
      new Notice("🎉 Published!");

      if (this.settings.saveToNote && this.settings.logNotePath) {
        await this.appendToNote(this.settings.logNotePath, text, response.url);
      }

      if (this.settings.alsoLogToDaily) {
        const daily =
          getDailyNote(moment(), getAllDailyNotes()) ?? (await createDailyNote(moment()));
        await this.appendToNote(daily.path.replace(/\.md$/, ""), text, response.url);
      }
    } catch (error) {
      console.error("Post failed:", error);
      new Notice("Failed to post. Saving locally.");
      const fallbackPath = `Failed Status - ${moment().format("YYYY-MM-DD HH-mm")}-${Math.floor(
        Math.random() * 1000
      )}`;
      await this.app.vault.create(fallbackPath + ".md", `Failed to post:\n\n${text}`);
    }
  }

  private getDataToPost(text: string, skipMastodon: boolean): string {
    const trimmed = text.trim();
    const splitter = new GraphemeSplitter();
    const graphemes = splitter.splitGraphemes(trimmed);

    const emojiGraphemes: string[] = [];
    for (const g of graphemes) {
      if (/\p{Extended_Pictographic}/u.test(g) || g === "\u200d") {
        emojiGraphemes.push(g);
      } else {
        break;
      }
    }

    const hasEmoji = emojiGraphemes.length > 0;
    const emoji = hasEmoji ? emojiGraphemes.join("") : this.settings.default_emoji;
    const content = hasEmoji ? trimmed.slice(emoji.length).trim() : trimmed;

    return JSON.stringify({
      content,
      emoji,
      skip_mastodon_post: skipMastodon,
    });
  }

  private async appendToNote(notePath: string, status: string, url: string) {
    const fullPath = `${notePath}.md`;
    const timestamp = moment().format("YYYY-MM-DD HH:mm");
    const safeStatus = status.replace(/[[\]]/g, "\\$&").replace(/\n+/g, " / ");
    const content = `\n- **${timestamp}**: (*[Link to status.lol](${url || "#"})*) - ${safeStatus}`;

    await this.ensureFolderExists(fullPath);

    const file = this.app.vault.getAbstractFileByPath(fullPath);
    if (file instanceof TFile) {
      await this.app.vault.append(file, content);
    } else {
      await this.app.vault.create(fullPath, content);
    }
  }
  private async ensureFolderExists(path: string) {
    const normalized = normalizePath(path);
    const folderPath = normalized.split("/").slice(0, -1).join("/");
    if (!folderPath) return;

    if (!this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath);
    }
  }

}
