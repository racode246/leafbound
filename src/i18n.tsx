import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'

export type Lang = 'ja' | 'en'
export type LangSetting = Lang | 'system'

const ja = {
  'boot.loading': 'ライブラリを読み込み中…',
  'dialog.addEpub': 'EPUB を追加',
  close: '閉じる',

  'lib.all': 'すべての本',
  'lib.uncategorized': '未分類',
  'lib.categories': 'カテゴリ',
  'lib.newCategory': '新しいカテゴリ',
  'lib.newCategoryAria': '新しいカテゴリ名',
  'lib.add': '追加',
  'lib.renameHint': 'ダブルクリックで名前を変更',
  'lib.removeCategory': 'カテゴリを削除',
  'lib.removeCategoryAria': '{name} を削除',
  'lib.search': 'タイトル・著者で検索',
  'lib.sort': '並び順',
  'sort.recent': '最近読んだ順',
  'sort.added': '追加順',
  'sort.title': 'タイトル順',
  'sort.author': '著者順',
  'view.label': '表示切替',
  'view.grid': '表紙表示',
  'view.list': 'リスト表示',
  'lib.import': '＋ EPUB を追加',
  'lib.importing': '追加中…',
  'lib.emptyTitle': 'まだ本がありません。',
  'lib.emptyHint': 'EPUB ファイルをここにドラッグ＆ドロップするか、「EPUB を追加」から取り込みます。',
  'lib.noMatch': '該当する本がありません。',
  'table.title': 'タイトル',
  'table.author': '著者',
  'table.categories': 'カテゴリ',
  'table.progress': '進捗',
  'card.unknownAuthor': '著者不明',
  'card.categories': 'カテゴリ',
  'card.delete': '削除',
  'progress.unread': '未読',
  'progress.done': '読了',
  'progress.aria': '進捗 {pct}%',
  'confirm.deleteBook': '「{title}」をライブラリから削除しますか？\nファイルのコピーも削除されます。',
  'confirm.deleteCategory': 'カテゴリ「{name}」を削除しますか？\n本は削除されません。',
  'notice.duplicates': 'すでに追加済みのためスキップしました: {names}',
  'notice.failed': '取り込めませんでした: {names}',
  'picker.title': 'カテゴリ',
  'picker.aria': 'カテゴリを設定',
  'picker.none': 'カテゴリがまだありません。',
  'picker.new': '新規カテゴリ',
  'picker.create': '作成',

  'reader.back': '← ライブラリ',
  'reader.backTitle': 'ライブラリへ戻る',
  'reader.toc': '目次',
  'reader.display': 'Aa 表示',
  'reader.prev': '前のページ',
  'reader.next': '次のページ',
  'reader.loading': '読み込み中…',
  'reader.openFailed': 'この本を開けませんでした。',
  'toc.title': '目次',
  'toc.empty': '目次がありません。',

  'reader.search': '検索',
  'reader.highlights': 'ハイライト',
  'search.title': '本文を検索',
  'search.placeholder': '検索語を入力して Enter',
  'search.searching': '検索中… ({done}/{total})',
  'search.results': '{count} 件',
  'search.none': '見つかりませんでした。',
  'search.tooMany': '上限に達したため最初の {max} 件のみ表示しています。',
  'hl.title': 'ハイライトとメモ',
  'hl.none': 'まだハイライトがありません。本文の文字を選択すると追加できます。',
  'hl.addNote': 'メモ',
  'hl.notePlaceholder': 'メモを書く',
  'hl.save': '保存',
  'hl.delete': '削除',
  'hl.edit': '編集',
  'hl.color.yellow': '黄',
  'hl.color.green': '緑',
  'hl.color.blue': '青',
  'hl.color.pink': '桃',

  'settings.title': '表示設定',
  'settings.flow': '読み方向',
  'flow.paginated': '横読み（ページ送り）',
  'flow.scrolled': '縦読み（スクロール）',
  'settings.spread': 'ページ',
  'spread.none': '単ページ',
  'spread.auto': '自動',
  'spread.always': '見開き',
  'spread.autoHint': 'ウィンドウが広いときだけ見開き',
  'spread.needsPaginated': '見開きは横読み（ページ送り）のときに使えます。',
  'settings.theme': '配色',
  'theme.light': '白',
  'theme.sepia': 'セピア',
  'theme.dark': '黒',
  'settings.font': 'フォント',
  'font.publisher': '出版社の指定',
  'font.serif': '明朝 (serif)',
  'font.sans': 'ゴシック (sans-serif)',
  'font.custom': 'カスタム…',
  'font.customPlaceholder': 'インストール済みフォント名',
  'font.customAria': 'カスタムフォント名',
  'font.apply': '適用',
  'settings.fontSize': '文字サイズ',
  'fontSize.smaller': '小さく',
  'fontSize.larger': '大きく',
  'settings.lineHeight': '行間',
  'lineHeight.tighter': '狭く',
  'lineHeight.wider': '広く',
  'settings.language': '言語',
  'lang.system': 'システムに従う',
  'lang.ja': '日本語',
  'lang.en': 'English',

  'win.minimize': '最小化',
  'win.maximize': '最大化',
  'win.restore': '元のサイズに戻す',
  'win.close': '閉じる'
}

export type Key = keyof typeof ja

const en: Record<Key, string> = {
  'boot.loading': 'Loading library…',
  'dialog.addEpub': 'Add EPUB',
  close: 'Close',

  'lib.all': 'All books',
  'lib.uncategorized': 'Uncategorized',
  'lib.categories': 'Categories',
  'lib.newCategory': 'New category',
  'lib.newCategoryAria': 'New category name',
  'lib.add': 'Add',
  'lib.renameHint': 'Double-click to rename',
  'lib.removeCategory': 'Delete category',
  'lib.removeCategoryAria': 'Delete {name}',
  'lib.search': 'Search title or author',
  'lib.sort': 'Sort order',
  'sort.recent': 'Recently read',
  'sort.added': 'Date added',
  'sort.title': 'Title',
  'sort.author': 'Author',
  'view.label': 'View',
  'view.grid': 'Cover grid',
  'view.list': 'List',
  'lib.import': '+ Add EPUB',
  'lib.importing': 'Adding…',
  'lib.emptyTitle': 'No books yet.',
  'lib.emptyHint': 'Drag and drop EPUB files here, or use “Add EPUB”.',
  'lib.noMatch': 'No books match.',
  'table.title': 'Title',
  'table.author': 'Author',
  'table.categories': 'Categories',
  'table.progress': 'Progress',
  'card.unknownAuthor': 'Unknown author',
  'card.categories': 'Categories',
  'card.delete': 'Delete',
  'progress.unread': 'Unread',
  'progress.done': 'Finished',
  'progress.aria': 'Progress {pct}%',
  'confirm.deleteBook': 'Remove “{title}” from the library?\nThe imported copy will be deleted too.',
  'confirm.deleteCategory': 'Delete the category “{name}”?\nBooks are kept.',
  'notice.duplicates': 'Already in the library, skipped: {names}',
  'notice.failed': 'Could not import: {names}',
  'picker.title': 'Categories',
  'picker.aria': 'Set categories',
  'picker.none': 'No categories yet.',
  'picker.new': 'New category',
  'picker.create': 'Create',

  'reader.back': '← Library',
  'reader.backTitle': 'Back to library',
  'reader.toc': 'Contents',
  'reader.display': 'Aa Display',
  'reader.prev': 'Previous page',
  'reader.next': 'Next page',
  'reader.loading': 'Loading…',
  'reader.openFailed': 'Could not open this book.',
  'toc.title': 'Table of contents',
  'toc.empty': 'No table of contents.',

  'reader.search': 'Search',
  'reader.highlights': 'Highlights',
  'search.title': 'Search in book',
  'search.placeholder': 'Type a query and press Enter',
  'search.searching': 'Searching… ({done}/{total})',
  'search.results': '{count} results',
  'search.none': 'No matches.',
  'search.tooMany': 'Showing the first {max} matches.',
  'hl.title': 'Highlights & notes',
  'hl.none': 'No highlights yet. Select text in the book to add one.',
  'hl.addNote': 'Note',
  'hl.notePlaceholder': 'Write a note',
  'hl.save': 'Save',
  'hl.delete': 'Delete',
  'hl.edit': 'Edit',
  'hl.color.yellow': 'Yellow',
  'hl.color.green': 'Green',
  'hl.color.blue': 'Blue',
  'hl.color.pink': 'Pink',

  'settings.title': 'Display',
  'settings.flow': 'Reading direction',
  'flow.paginated': 'Paged (horizontal)',
  'flow.scrolled': 'Scroll (vertical)',
  'settings.spread': 'Pages',
  'spread.none': 'Single',
  'spread.auto': 'Auto',
  'spread.always': 'Two-page',
  'spread.autoHint': 'Two pages only when the window is wide',
  'spread.needsPaginated': 'Two-page spread is available in paged mode.',
  'settings.theme': 'Colors',
  'theme.light': 'Light',
  'theme.sepia': 'Sepia',
  'theme.dark': 'Dark',
  'settings.font': 'Font',
  'font.publisher': 'Publisher default',
  'font.serif': 'Serif',
  'font.sans': 'Sans-serif',
  'font.custom': 'Custom…',
  'font.customPlaceholder': 'Installed font name',
  'font.customAria': 'Custom font name',
  'font.apply': 'Apply',
  'settings.fontSize': 'Font size',
  'fontSize.smaller': 'Smaller',
  'fontSize.larger': 'Larger',
  'settings.lineHeight': 'Line spacing',
  'lineHeight.tighter': 'Tighter',
  'lineHeight.wider': 'Wider',
  'settings.language': 'Language',
  'lang.system': 'Follow system',
  'lang.ja': '日本語',
  'lang.en': 'English',

  'win.minimize': 'Minimize',
  'win.maximize': 'Maximize',
  'win.restore': 'Restore',
  'win.close': 'Close'
}

const DICTS: Record<Lang, Record<Key, string>> = { ja, en }

export function systemLang(): Lang {
  const tag = typeof navigator !== 'undefined' ? navigator.language : ''
  return tag.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

export function resolveLang(setting: LangSetting | undefined): Lang {
  if (setting === 'ja' || setting === 'en') return setting
  return systemLang()
}

export type Translate = (key: Key, vars?: Record<string, string | number>) => string

function makeT(lang: Lang): Translate {
  const dict = DICTS[lang]
  return (key, vars) => {
    let text = dict[key] ?? ja[key] ?? key
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.split(`{${name}}`).join(String(value))
      }
    }
    return text
  }
}

interface I18n {
  lang: Lang
  t: Translate
}

const I18nContext = createContext<I18n>({ lang: 'ja', t: makeT('ja') })

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(lang) }), [lang])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  return useContext(I18nContext)
}

export function useT(): Translate {
  return useContext(I18nContext).t
}
