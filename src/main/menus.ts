// Right-click menus. An app's own menus (Launchpad has them on nearly everything) win: Electron only asks for this one
// where the page didn't show its own, so this is the browser's usual menu, for fields, selected text, links, images
// and the page itself.

import { Menu, clipboard, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents } from 'electron';

export interface PageMenuHelpers {
  /** Opens an address the way a link click would: another app, or the default browser. */
  openLink: (url: string) => void;
  /** The other app an address belongs to, if any, for "Open in Launchpad". */
  appNameFor: (url: string) => string | null;
  openPageExternally: () => void;
}

export function pageMenu(params: ContextMenuParams, wc: WebContents, help: PageMenuHelpers): Menu | null {
  const items: MenuItemConstructorOptions[] = [];
  const gap = () => {
    if (items.length && items[items.length - 1]!.type !== 'separator') items.push({ type: 'separator' });
  };
  const f = params.editFlags;

  if (params.misspelledWord) {
    for (const s of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: s, click: () => wc.replaceMisspelling(s) });
    }
    if (!params.dictionarySuggestions.length) items.push({ label: 'No spelling suggestions', enabled: false });
    items.push({
      label: 'Add to dictionary',
      click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });
    gap();
  }

  if (params.linkURL && !params.linkURL.startsWith('javascript:')) {
    const other = help.appNameFor(params.linkURL);
    items.push({ label: other ? `Open in ${other}` : 'Open link in browser', click: () => help.openLink(params.linkURL) });
    items.push({ label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) });
    gap();
  }

  if (params.mediaType === 'image' && params.srcURL) {
    items.push({ label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) });
    if (!params.srcURL.startsWith('data:')) {
      items.push({ label: 'Copy image address', click: () => clipboard.writeText(params.srcURL) });
    }
    items.push({ label: 'Save image', click: () => wc.downloadURL(params.srcURL) });
    gap();
  }

  if (params.isEditable) {
    items.push(
      { label: 'Undo', role: 'undo', enabled: f.canUndo },
      { label: 'Redo', role: 'redo', enabled: f.canRedo },
      { type: 'separator' },
      { label: 'Cut', role: 'cut', enabled: f.canCut },
      { label: 'Copy', role: 'copy', enabled: f.canCopy },
      { label: 'Paste', role: 'paste', enabled: f.canPaste },
      { label: 'Paste as plain text', role: 'pasteAndMatchStyle', enabled: f.canPaste },
      { type: 'separator' },
      { label: 'Select all', role: 'selectAll', enabled: f.canSelectAll },
    );
  } else if (params.selectionText.trim()) {
    items.push({ label: 'Copy', role: 'copy' });
  }

  // Nothing more specific: the page's own items, as a browser has them.
  if (!items.length) {
    const h = wc.navigationHistory;
    items.push(
      { label: 'Back', enabled: h.canGoBack(), click: () => h.goBack() },
      { label: 'Forward', enabled: h.canGoForward(), click: () => h.goForward() },
      { label: 'Reload', click: () => wc.reload() },
      { type: 'separator' },
      { label: 'Open page in browser', click: help.openPageExternally },
      { label: 'Copy page address', click: () => clipboard.writeText(wc.getURL()) },
    );
  }

  gap();
  items.push({ label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) });
  return Menu.buildFromTemplate(items);
}
