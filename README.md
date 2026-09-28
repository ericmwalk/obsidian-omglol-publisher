# OMG.lol Publisher Plugin for Obsidian

This plugin has changed it's name from Status.lol Plugin to just Omg.lol Publish as you can make post to  as well as continue to post status updates to . you can use some.pics to post pictures for all your web needs.

Publish and manage your omg.lol presence directly from Obsidian. Write [weblog.lol](https://weblog.lol) posts/pages, [status.lol](https://status.lol) updates, [paste.lol](https://paste.lol) pastes, and [some.pics](https://some.pics) photos without leaving your vault. In addition you can keep your /now page and profile page in sync too.

*Since OMG.lol has a great API, there is more than can continue to be built out so why not make this plugin more expandable than the original concept.*


## Configuration Screenshot
#### Main Settings / Modulals activated
![screenshot|300](screenshots/omg.lol-settings.png)

#### paste.lol Settings
![screenshot|300](screenshots/paste.lol-settings.png)

#### status.lol Settings
![screenshot|300](screenshots/status.lol-settings.png)

#### weblog.lol Settings
![screenshot|300](screenshots/weblog.lol-settings.png)

#### some.pics Settings
![screenshot|300](screenshots/some.pics-settings.png)


## Features
### Weblog.lol
- Publish new weblog posts directly from Obsidian
- Update previously published posts using your saved entry ID
- Batch publish multiple posts at once
- Support for backdating or futuredating via frontmatter date/time
- Publish with tags, draft status, custom slug, and page type (read from frontmatter)
- Pass a `template` frontmatter field through to the omg.lol weblog template system
- Automatically rename note files after publishing (optional)
- Auto-organize posts into `yyyy/mm` subfolders after publishing (optional)
- Wikilinks in post body are resolved to URLs on publish
- Import all existing weblog posts from omg.lol into your vault — full frontmatter written on import, duplicates skipped

**Weblog frontmatter fields**
- `entry` — entry ID, written automatically on first publish; used to update existing posts
- `slug` — custom slug; generated from title if not set
- `title` — post title
- `date` — publish date (`YYYY-MM-DD` or `YYYY-MM-DD HH:mm`)
- `status` — `published` or `draft`
- `type` — `page` to publish as a page instead of a post
- `tags` — list of tags
- `template` — omg.lol weblog template to use for this post

### Status.lol
- Post status updates to your status.lol address
- Choose whether to also share them on social.lol (toggle per post)
- Save to a custom log note or to your Daily Note
- Works with both Daily Notes and Periodic Notes plugins
- If posting fails it will still save to a note so you don't lose your status

### Some.pics
- Upload pictures directly from Obsidian to some.pics
- Caption and alt text pre-filled from image metadata
- Keep a log of uploaded pictures to map back if any go missing
- Original files are kept in your vault after upload
- Optionally cross-post a picture to Mastodon from the upload/edit window (off by default). Turning it off when editing removes the post from Mastodon. The post goes to whichever Mastodon account you've connected in your some.pics settings on omg.lol, so that has to be set up on the omg.lol website first
- If auto-posting to Mastodon is turned on in your some.pics settings, every pic gets posted and this toggle has no effect. Turn auto-posting off on omg.lol if you want to choose per pic

### Paste.lol
- Quickly create pastes from a note
- If a fenced code block is present (e.g.,` ```javascript `), only that content is uploaded — the rest of the note stays private
- Falls back to the full note body if no fenced block is found
- Automatically copies the resulting URL back into your note
- Wikilinks are resolved to URLs before creating the paste

### Other omg.lol Pages/Configurations
- Publish your `/now` page directly from a note
- Publish your omg.lol profile web page, including optional custom CSS and HTML `<head>` content
- Update your status.lol bio, including optional custom CSS and HTML `<head>` content
- Content lives in a fenced ` ```markdown ` block in your note; CSS in a ` ```css ` block; custom head HTML in a ` ```html head ` block

**Required frontmatter to identify each note**
- `/now` page: `type: profile` and `entry: now`
- Profile web page: `type: profile` and `entry: web`
- Status.lol bio: `type: status` and `entry: bio`


## Setup

1. Search for **OMG.lol Publisher** in Obsidian's Community Plugins browser and install it.
2. Enable the plugin in Settings → Community Plugins.
3. Open the plugin settings and enter your omg.lol API key and address.
4. Enable the services you want to use (Weblog, Status, Some.pics, Paste.lol).
