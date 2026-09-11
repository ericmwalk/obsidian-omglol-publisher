export interface StatusPosterSettings {
  skip_mastodon_post: boolean;
  default_emoji: string;
  saveToNote?: boolean;
  logNotePath?: string | null;
  alsoLogToDaily?: boolean;
  enableStatusPoster?: boolean;
}

export interface WeblogPublisherSettings {
  enableWeblog?: boolean;
  enableRenaming: boolean;
  renamePages: boolean;
  slugWordCount: number;
  weblogBaseUrl: string;
  weblogRelativeLinks?: boolean;
  weblogPathFormatOverride?: string;
  enableAutoOrganize?: boolean;
  autoOrganizeBasePath?: string;
  weblogImportPath?: string;
}

export interface PicsUploaderSettings {
  enablePics?: boolean;
  defaultPicsTags: string; 
  chatgptApiKey?: string; // for future alt text generation
  deleteAfterUpload?: boolean;
  maintainPicsLog?: boolean;
  picsLogPath?: string;
  monthlyPicsLogs: boolean;

}
export interface PastebinSettings {
  enablePastebin: boolean;
  pastebinBaseUrl: string;
}

export interface SharedOmgSettings {
  username: string;
  token: string;
  apiToken: string; // still shared across modules
  address: string;
}

export interface CombinedSettings
  extends SharedOmgSettings,
    StatusPosterSettings,
    WeblogPublisherSettings,
    PicsUploaderSettings,
    PastebinSettings {}

export const DEFAULT_SETTINGS: CombinedSettings = {
  username: "",
  token: "",
  apiToken: "",
  address: "",

  // Status defaults
  skip_mastodon_post: true,
  default_emoji: "💬",
  saveToNote: true,
  logNotePath: "status-log",
  alsoLogToDaily: false,
  enableStatusPoster: true,

  // Weblog defaults
  enableWeblog: true,
  enableRenaming: true,
  renamePages: false,
  slugWordCount: 5,
  weblogBaseUrl: "",
  weblogRelativeLinks: false,
  weblogPathFormatOverride: "",
  enableAutoOrganize: false,
  autoOrganizeBasePath: "",
  weblogImportPath: "",

  // Pics defaults
  enablePics: false,
  defaultPicsTags: "omgPublish",
  chatgptApiKey: "",
  deleteAfterUpload: false,
  maintainPicsLog: false,
  monthlyPicsLogs: false,
  picsLogPath: "_pics-upload-log.md",

  // Pastebin
  enablePastebin: true,
  pastebinBaseUrl: "",

};
