import { App, PluginSettingTab, Setting, setIcon, FuzzySuggestModal, TFolder, Notice } from "obsidian";
import OmglolPublish from "./main";


export class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: OmglolPublish) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("omg.lol Plugin").setHeading();

    // === Shared OMG Settings ===
    new Setting(containerEl)
      .setName("OMG.lol Username")
      .setDesc("Your omg.lol username")
      .addText(text =>
        text
          .setPlaceholder("username")
          .setValue(this.plugin.settings.username || "")
          .onChange(async (value) => {
            this.plugin.settings.username = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Token")
      .setDesc("Your omg.lol API token")
      .addText(text => {
        text
          .setPlaceholder("token")
          .setValue(this.plugin.settings.token || "")
          .onChange(async (value) => {
            this.plugin.settings.token = value.trim();
            await this.plugin.saveSettings();
          });

        // Start masked
        // @ts-ignore
        text.inputEl.type = "password";

        // Eye toggle
        const eyeIcon = containerEl.createDiv({ cls: "clickable-icon omg-eye-icon" });
        setIcon(eyeIcon, "eye");

        let visible = false;
        eyeIcon.onclick = () => {
          visible = !visible;
          // @ts-ignore
          text.inputEl.type = visible ? "text" : "password";
          setIcon(eyeIcon, visible ? "eye-off" : "eye");
        };

        text.inputEl.parentElement?.appendChild(eyeIcon);

        return text;
      });

    new Setting(containerEl).setName("omg.lol Modules Enabled").setHeading();
    // === Status.lol ===
    new Setting(containerEl)
      .setName("Status.lol")
      .setDesc("Enable posting to status.lol")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableStatusPoster ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enableStatusPoster = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );
    // === Weblog.lol ===
    new Setting(containerEl)
      .setName("Weblog.lol")
      .setDesc("Enable publishing to weblog.lol")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableWeblog ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enableWeblog = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );
    // === some.pics ===
    new Setting(containerEl)
      .setName("some.pics")
      .setDesc("Enable image uploads to some.pics")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enablePics ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enablePics = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );
      // === Pastebin ===
      new Setting(containerEl)
        .setName("paste.lol")
        .setDesc("Enable publishing to paste.lol")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.enablePastebin)
            .onChange(async (value) => {
              this.plugin.settings.enablePastebin = value;
              await this.plugin.saveSettings();
              this.display();
            })
        );

    // === paste.lol Settings ===
    if (this.plugin.settings.enablePastebin) {
      new Setting(containerEl).setName("paste.lol").setHeading();

      new Setting(containerEl)
        .setName("Paste base URL")
        .setDesc("Only needed if you use a custom domain. Leave blank to use username.paste.lol automatically.")
        .addText(text =>
          text
            .setPlaceholder("https://username.paste.lol")
            .setValue(this.plugin.settings.pastebinBaseUrl || "")
            .onChange(async (value) => {
              this.plugin.settings.pastebinBaseUrl = value.trim().replace(/\/$/, "");
              await this.plugin.saveSettings();
            })
        );
    }

    // === Status.lol Settings ===
    if (this.plugin.settings.enableStatusPoster) {
      new Setting(containerEl).setName("Status").setHeading();

      new Setting(containerEl)
        .setName("Default emoji")
        .setDesc("Emoji to prepend if none is given")
        .addText(text =>
          text.setPlaceholder("💬")
            .setValue(this.plugin.settings.default_emoji)
            .onChange(async (value) => {
              this.plugin.settings.default_emoji = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Skip Mastodon post")
        .setDesc("Prevent cross-posting to Mastodon")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.skip_mastodon_post)
            .onChange(async (value) => {
              this.plugin.settings.skip_mastodon_post = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Save to note")
        .setDesc("Save status to a log note")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.saveToNote ?? true)
            .onChange(async (value) => {
              this.plugin.settings.saveToNote = value;
              await this.plugin.saveSettings();
              this.display();
            })
        );

        if (this.plugin.settings.saveToNote) {
          new Setting(containerEl)
            .setName("Log note path")
            .setDesc("Full path to the log file (.md) folders will be created automatically")
            .addText(text => {
              text
              .setPlaceholder("Logs/status-log.md")
              .setValue(this.plugin.settings.logNotePath ?? "")
              .onChange(async (value) => {
                this.plugin.settings.logNotePath = value.trim();
                await this.plugin.saveSettings();
              });

            const browseBtn = text.inputEl.parentElement?.createEl("button", {
              text: "📁",
              cls: "clickable-icon",
            });

            browseBtn?.addEventListener("click", () => {
              new FolderSuggest(this.app, text.inputEl, "status-log.md").open();
            });

            return text;
          });
        }


      new Setting(containerEl)
        .setName("Also log to Daily Note")
        .setDesc("Append status to today's Daily Note as well")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.alsoLogToDaily ?? false)
            .onChange(async (value) => {
              this.plugin.settings.alsoLogToDaily = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // === Weblog.lol Settings===
    if (this.plugin.settings.enableWeblog) {
      new Setting(containerEl).setName("Weblog").setHeading();

      new Setting(containerEl)
        .setName("Enable automatic renaming")
        .setDesc("Rename note to use slug after publishing")
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableRenaming)
            .onChange(async (value) => {
              this.plugin.settings.enableRenaming = value;
              if (!value) this.plugin.settings.renamePages = false;
              await this.plugin.saveSettings();
              this.display();
            })
        );

      if (this.plugin.settings.enableRenaming) {
        new Setting(containerEl)
          .setName("Rename Pages")
          .setDesc("If frontmatter has `type: page`, rename those too")
          .addToggle(toggle =>
            toggle
              .setValue(this.plugin.settings.renamePages ?? false)
              .onChange(async (value) => {
                this.plugin.settings.renamePages = value;
                await this.plugin.saveSettings();
              })
          );
      }

      new Setting(containerEl)
        .setName("Slug word count")
        .setDesc("Number of words to use in auto-generated slug")
        .addText(text =>
          text.setPlaceholder("5")
            .setValue(this.plugin.settings.slugWordCount.toString())
            .onChange(async (value) => {
              const num = parseInt(value);
              if (!isNaN(num) && num > 0) {
                this.plugin.settings.slugWordCount = num;
                await this.plugin.saveSettings();
              }
            })
        );

      if (!this.plugin.settings.weblogRelativeLinks) {
        new Setting(containerEl)
          .setName("Weblog base URL")
          .setDesc("Only needed if you use a custom domain. Leave blank to use username.weblog.lol automatically. (e.g. https://runs.lol)")
          .addText(text =>
            text
              .setPlaceholder("https://username.weblog.lol")
              .setValue(this.plugin.settings.weblogBaseUrl || "")
              .onChange(async (value) => {
                this.plugin.settings.weblogBaseUrl = value.trim().replace(/\/$/, "");
                await this.plugin.saveSettings();
              })
          );
      }

      new Setting(containerEl)
        .setName("Relative links")
        .setDesc('Links between your notes omit the domain entirely, e.g. "/books" instead of "https://runs.lol/books".')
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.weblogRelativeLinks ?? false)
            .onChange(async (value) => {
              this.plugin.settings.weblogRelativeLinks = value;
              await this.plugin.saveSettings();
              this.display();
            })
        );

      new Setting(containerEl)
        .setName("Post path format override")
        .setDesc('Blank = auto-detect. Otherwise set your own, e.g. /Y/m/d/, or "/" for a flat structure.')
        .addText(text =>
          text
            .setPlaceholder("/Y/m/d/")
            .setValue(this.plugin.settings.weblogPathFormatOverride || "")
            .onChange(async (value) => {
              this.plugin.settings.weblogPathFormatOverride = value.trim();
              await this.plugin.saveSettings();
            })
        )
        .addButton(button =>
          button
            .setButtonText("Verify against omg.lol")
            .onClick(async () => {
              const publisher = this.plugin.weblogPublisher;
              if (!publisher) {
                new Notice("Enable weblog publishing first.");
                return;
              }
              button.setDisabled(true);
              try {
                const live = await publisher.fetchPostPathFormatFromApi();
                const override = this.plugin.settings.weblogPathFormatOverride?.trim();
                if (!live) {
                  new Notice("Couldn't read a post path format from omg.lol.");
                } else if (!override) {
                  new Notice(`omg.lol reports "${live}" (no override set, so this is already what gets used).`);
                } else if (live === override) {
                  new Notice(`✅ Matches your account's configuration ("${live}").`);
                } else {
                  new Notice(`⚠️ Your account's configuration is "${live}", but your override is "${override}".`);
                }
              } catch (error) {
                console.error("Failed to verify post path format:", error);
                new Notice(`Failed to reach omg.lol to verify: ${error instanceof Error ? error.message : error}`);
              } finally {
                button.setDisabled(false);
              }
            })
        );

      new Setting(containerEl)
        .setName("Auto-organize posts by date")
        .setDesc("Move each post into a yyyy/mm subfolder under the base path after publishing. Re-publishing corrects the location if the date changed.")
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.enableAutoOrganize ?? false)
            .onChange(async (value) => {
              this.plugin.settings.enableAutoOrganize = value;
              await this.plugin.saveSettings();
              this.display();
            })
        );

      if (this.plugin.settings.enableAutoOrganize) {
        new Setting(containerEl)
          .setName("Base folder path")
          .setDesc("Posts will be placed at base/yyyy/mm/filename (e.g. runs.lol/weblog/posts)")
          .addText(text => {
            text
              .setPlaceholder("runs.lol/weblog/posts")
              .setValue(this.plugin.settings.autoOrganizeBasePath ?? "")
              .onChange(async (value) => {
                this.plugin.settings.autoOrganizeBasePath = value.trim();
                await this.plugin.saveSettings();
              });

            const browseBtn = text.inputEl.parentElement?.createEl("button", {
              text: "📁",
              cls: "clickable-icon",
            });

            browseBtn?.addEventListener("click", () => {
              new FolderSuggest(this.app, text.inputEl, "").open();
            });

            return text;
          });
      }

      new Setting(containerEl)
        .setName("Import base path")
        .setDesc("Folder where imported posts land (yyyy/mm subfolders created automatically). Falls back to base folder path if set. Leave blank to be prompted at import time.")
        .addText(text => {
          text
            .setPlaceholder("weblog/posts")
            .setValue(this.plugin.settings.weblogImportPath ?? "")
            .onChange(async (value) => {
              this.plugin.settings.weblogImportPath = value.trim();
              await this.plugin.saveSettings();
            });

          const browseBtn = text.inputEl.parentElement?.createEl("button", {
            text: "📁",
            cls: "clickable-icon",
          });

          browseBtn?.addEventListener("click", () => {
            new FolderSuggest(this.app, text.inputEl, "").open();
          });

          return text;
        });
    }

    // === some.pics Settings===
    if (this.plugin.settings.enablePics) {
      new Setting(containerEl).setName("some.pics").setHeading();

      new Setting(containerEl)
        .setName("Default tags")
        .setDesc("Tags to apply to all uploaded images (comma or space separated)")
        .addText(text =>
          text
            .setPlaceholder("obsidian upload")
            .setValue(this.plugin.settings.defaultPicsTags || "")
            .onChange(async (value) => {
              this.plugin.settings.defaultPicsTags = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("ChatGPT API key (for alt text)")
        .setDesc("Optional: provide an API key to auto-generate alt text for images")
        .addText(text => {
          text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.chatgptApiKey || "")
            .onChange(async (value) => {
              this.plugin.settings.chatgptApiKey = value.trim();
              await this.plugin.saveSettings();
            });

          // Start masked
          // @ts-ignore
          text.inputEl.type = "password";

          // Eye toggle
          const eyeIcon = containerEl.createEl("div", { cls: "clickable-icon" });
          setIcon(eyeIcon, "eye");
          eyeIcon.style.cursor = "pointer";
          eyeIcon.style.marginLeft = "8px";
          eyeIcon.style.display = "flex";
          eyeIcon.style.alignItems = "center";

          let visible = false;
          eyeIcon.onclick = () => {
            visible = !visible;
            // @ts-ignore
            text.inputEl.type = visible ? "text" : "password";
            setIcon(eyeIcon, visible ? "eye-off" : "eye");
          };

          text.inputEl.parentElement?.appendChild(eyeIcon);

          return text;
        });

      new Setting(containerEl)
        .setName("Maintain upload log")
        .setDesc("Save a record of each uploaded picture in a log note")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.maintainPicsLog ?? false)
            .onChange(async (value) => {
              this.plugin.settings.maintainPicsLog = value;
              await this.plugin.saveSettings();
              this.display();
            })
        );
      new Setting(containerEl)
        .setName("Monthly log rotation")
        .setDesc("Split some.pics logs into monthly files with an index")
        .addToggle(toggle =>
          toggle
            .setValue(this.plugin.settings.monthlyPicsLogs)
            .onChange(async (value) => {
              this.plugin.settings.monthlyPicsLogs = value;
              await this.plugin.saveSettings();
            })
        );

      if (this.plugin.settings.maintainPicsLog) {
        new Setting(containerEl)
          .setName("Log note path")
          .setDesc("Full path to the log file (.md) folders will be created automatically")
          .addText(text => {
              text
              .setPlaceholder("Logs/pics-upload-log.md")
              .setValue(this.plugin.settings.picsLogPath ?? "")
              .onChange(async (value) => {
                this.plugin.settings.picsLogPath = value.trim();
                await this.plugin.saveSettings();
              });

            const browseBtn = text.inputEl.parentElement?.createEl("button", {
              text: "📁",
              cls: "clickable-icon",
            });

            browseBtn?.addEventListener("click", () => {
              new FolderSuggest(this.app, text.inputEl, "pics-upload-log.md").open();
            });

            return text;
          });
      }

      new Setting(containerEl)
        .setName("Delete after upload")
        .setDesc("Remove original image file from vault after uploading")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.deleteAfterUpload ?? false)
            .onChange(async (value) => {
              this.plugin.settings.deleteAfterUpload = value;
              await this.plugin.saveSettings();
            })
        );
    }
  }
}

// ===== Helper: Logic for Fuzzy Suggest for Folders =====
  class FolderSuggest extends FuzzySuggestModal<TFolder> {
    constructor(
      app: App,
      private targetInputEl: HTMLInputElement,
      private defaultFileName: string
    ) {
      super(app);
      this.setPlaceholder("Select a folder…");
    }

    getItems(): TFolder[] {
      return this.app.vault
        .getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder);
    }

    getItemText(folder: TFolder): string {
      return folder.path;
    }

    onChooseItem(folder: TFolder) {
      const current = this.targetInputEl.value.trim();

      // Extract filename if one exists
      const parts = current.split("/");
      const lastPart = parts[parts.length - 1];
      const hasFilename = lastPart && !current.endsWith("/");

      const filename = hasFilename ? lastPart : this.defaultFileName;

      this.targetInputEl.value = `${folder.path}/${filename}`;
      this.targetInputEl.dispatchEvent(new Event("input"));
    }

  }




