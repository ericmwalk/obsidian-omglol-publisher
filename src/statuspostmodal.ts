import { App, Modal, Notice, ButtonComponent, Setting } from "obsidian";
import { OmglolPublish } from "./main";
import { StatusPosterSettings } from "./types";

export class StatusPostModal extends Modal {
  statusText: string = "";
  sharePublicly: boolean = true;
  onSubmit: (status: string, share: boolean) => void;

  private settings: StatusPosterSettings;
  private skipMasto: boolean;

  constructor(
    app: App,
    public plugin: OmglolPublish,
    settings: StatusPosterSettings,
    onSubmit: (status: string, share: boolean) => void,
    defaultSkipMasto: boolean
  ) {
    super(app);
    this.plugin = plugin;
    this.settings = settings;
    this.onSubmit = onSubmit;
    this.skipMasto = defaultSkipMasto;
    this.sharePublicly = !defaultSkipMasto;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Post to status.lol" });

    const textarea = contentEl.createEl("textarea", { cls: "status-input" });
    textarea.rows = 4;

    textarea.addEventListener("input", () => {
      this.statusText = textarea.value;
    });

    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        this.submit();
      }
    });

    window.setTimeout(() => textarea.focus(), 100);

    new Setting(contentEl)
      .setName("Post to social.lol")
      .addToggle((toggle) =>
        toggle.setValue(this.sharePublicly).onChange((val) => {
          this.sharePublicly = val;
        })
      );

    new ButtonComponent(contentEl)
      .setButtonText("Post")
      .setCta()
      .onClick(() => this.submit());
  }

  submit() {
    const text = this.statusText.trim();
    if (!text) {
      new Notice("Please enter a status.");
      return;
    }
    this.onSubmit(text, !this.sharePublicly); // true = skip Mastodon
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
