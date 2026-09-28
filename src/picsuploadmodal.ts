// picuploadmodal.ts

import { App, Modal, Setting, TFile, Notice } from "obsidian";
import { PicsUploader } from "./picsuploader";

export class PicUploadModal extends Modal {
  uploader: PicsUploader;
  file: TFile | null;
  picId?: string;

  description: string = "";
  tags: string = "";
  hidden: boolean = false;
  postToMastodon: boolean = false;
  wasOnMastodon: boolean = false;
  altText: string = "";
  previewUrl: string = ""; // for thumbnail
  remoteUrl?: string;


  constructor(
    app: App,
    uploader: PicsUploader,
    file: TFile | null,
    picId?: string,
    existingData?: any
  ) {
    super(app);
    this.uploader = uploader;
    this.file = file;
    this.picId = picId;

  // Detect remote upload
  if (existingData?.remoteUrl) {
    this.remoteUrl = existingData.remoteUrl;
  }

    // Prefill if editing
    if (existingData) {
      this.description = existingData.description || "";
      this.tags = Array.isArray(existingData.tags)
        ? existingData.tags.join(", ")
        : (existingData.tags || "");
      this.hidden = !!existingData.hide_from_public;
      this.wasOnMastodon = existingData.mastodon?.state === "posted";
      this.postToMastodon = this.wasOnMastodon;
      this.altText = existingData.alt_text || "";

      // ✅ Use API-provided URL directly
      this.previewUrl = existingData.url || "";
      // Debugging console.log("Preview URL in modal:", this.previewUrl);
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", {
      text: this.file || this.remoteUrl
        ? "Upload Image to some.pics"
        : "Edit some.pics Image",

    });
    // Debugging console.log("Preview URL in modal:", this.previewUrl);

    // Thumbnail preview if editing
    if (!this.file && this.previewUrl) {
      contentEl.createEl("img", { attr: { src: this.previewUrl }, cls: "somepics-preview-img" });
    }

    // Show preview for remote upload
    if (this.remoteUrl) {
      contentEl.createEl("img", { attr: { src: this.remoteUrl }, cls: "somepics-preview-img" });
    }

    // === Prefilled fields ===
    new Setting(contentEl)
      .setName("Description")
      .addTextArea((text) => {
        text
          .setValue(this.description)
          .onChange((value) => {
            this.description = value;
          });

        text.inputEl.rows = 3;
        text.inputEl.classList.add("somepics-textarea", "somepics-description");
      });

    new Setting(contentEl)
      .setName("Tags")
      .setDesc("Comma separated")
      .addText((text) => {
        text
          .setValue(this.tags)
          .onChange((value) => {
            this.tags = value;
          });

        text.inputEl.classList.add("somepics-textarea");
      });

    const altSetting = new Setting(contentEl)
      .setName("Alt Text")
      .addTextArea((text) => {
        text
          .setValue(this.altText)
          .onChange((value) => {
            this.altText = value;
          });

        text.inputEl.rows = 2;
        text.inputEl.classList.add("somepics-textarea", "alt-text-field");
      });

    if (this.uploader.settings.chatgptApiKey) {
      altSetting.addButton((btn) => {
        btn.setButtonText("Generate").onClick(async () => {
          const imageUrl = this.remoteUrl || this.previewUrl;
          if (!imageUrl) return;
          btn.setButtonText("...").setDisabled(true);
          const alt = await this.uploader.generateAltText(imageUrl, this.file?.name || "image");
          this.altText = alt;
          const altField = this.contentEl.querySelector(".alt-text-field") as HTMLTextAreaElement | null;
          if (altField) altField.value = alt;
          btn.setButtonText("Generate").setDisabled(false);
        });
      });
    }

    new Setting(contentEl)
      .setName("Hide from public feed")
      .addToggle((toggle) =>
        toggle.setValue(this.hidden).onChange((value) => {
          this.hidden = value;
        })
      );

    new Setting(contentEl)
      .setName("Post to Mastodon")
      .addToggle((toggle) =>
        toggle.setValue(this.postToMastodon).onChange((value) => {
          this.postToMastodon = value;
        })
      );

    // === Buttons ===
    new Setting(contentEl)
    .addButton((btn) =>
      btn
        .setButtonText(this.file || this.remoteUrl ? "Upload" : "Update")
        .setCta()
        .onClick(async () => {
          try {
            const finalAlt = this.altText;

            // === Perform upload or update ===
            if (this.remoteUrl) {
              await this.uploader.uploadFile(
                this.remoteUrl,
                this.description,
                this.hidden,
                finalAlt,
                this.tags,
                this.postToMastodon
              );
            } else if (this.file) {
              await this.uploader.uploadFile(
                this.file,
                this.description,
                this.hidden,
                finalAlt,
                this.tags,
                this.postToMastodon
              );
            } else if (this.picId) {
              await this.uploader.updateMetadata(
                this.picId,
                this.description,
                this.tags,
                this.hidden,
                finalAlt
              );

              if (this.postToMastodon && !this.wasOnMastodon) {
                await this.uploader.postToMastodon(this.picId);
              } else if (!this.postToMastodon && this.wasOnMastodon) {
                await this.uploader.removeFromMastodon(this.picId);
              }
            }

            new Notice(this.file || this.remoteUrl ? "Uploaded ✅" : "Updated ✅");
            this.close();
          } catch (err) {
            console.error("Action failed:", err);
            new Notice("Action failed. Check console for details.");
          }
        })
    )
    .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close())
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
