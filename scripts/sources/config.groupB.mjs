// Small-area sources (group B). Entries here override scripts/sources/config.mjs.
// `url` is the page people read; `feed` (optional) is what the adapter fetches; `opts` are explained in each adapter.
const SEASON = 'closed for (the )?(\\d{4}(-\\d{2,4})? )?(winter )?season';
const rows = (url, opts, feed) => ({ url, ...(feed ? { feed } : {}), parser: 'htmlrows', opts });
const flag = (url, opts) => ({ url, parser: 'closedflag', opts });

export const SOURCES = {
  // ---- one HTML row per lift ----
  'butternut': rows('https://skibutternut.com/the-mountain/trails-conditions/condition-report/', {
    scope: 'table.lifts-table', row: 'tbody tr', name: 0, status: 1,
    season: { sel: 'table.status-table tr', re: '^Hours\\s*Mountain:\\s*' + SEASON },
    updated: { sel: 'table.status-table tr', re: 'Last Updated\\s*([\\d/]+)' },
    note: 'table.status-table tr:contains("Comments") td:last-child' }),
  'otis-ridge': rows('https://otisridge.com/conditions/', {
    scope: 'table:has(th:contains("LIFTS"))', row: 'tbody tr', name: 0, status: [1, 2], // day column, night column
    season: { sel: '.the_content_wrapper p', re: '^' + SEASON + '$' },
    updated: { sel: '.lastmod-date time' } }),
  'mount-southington': rows('https://mountsouthington.com/trails-and-conditions', {
    scope: '.trails-and-lifts .lifts-open', row: 'li.trail', name: '.trail-name', status: '.status',
    nameClean: ':.*$|\\s+-\\s+To Summit.*$|\\s*\\(.*?\\)',
    updated: { sel: '.overall-conditions .last-updated span' }, note: '.overall-conditions .detailed-conditions' }),
  'mohawk-mountain': rows('https://www.mohawkmtn.com/snow-report/', {
    scope: '#snow-report-lifts-wrapper', row: '.lift', name: 0, status: -1, // last cell: Yes / No under "Open"
    season: { sel: '#snow-report-details-wrapper .cell', re: SEASON },
    updated: { sel: '#snow-report-updated h5:contains("Date") span' },
    note: '#snow-report-details-wrapper .cell' }),
  'bigrock': rows('https://bigrockmaine.com/mountain/trail-report/', {
    scope: 'table:has(th:contains("Lifts"))', row: 'tbody tr', name: [2, 1], status: 3 }),
  'nashoba-valley': rows('https://skinashoba.com/snow_report/', {
    scope: 'figure.wp-block-table table', row: 'tr', start: '^Lift Name', name: [0, 1], status: 2,
    season: { sel: 'figure.wp-block-table tr', re: '^(Snow Conditions|Hours of Operation)\\s*' + SEASON.replace('the ', '(the )?') } }),
  'mt-abram': rows('https://www.mtabram.com/winter/mountain-report/', {
    scope: 'body', row: '.g-cols.wpb_row:not(:has(.g-cols.wpb_row))', start: '^Chairlift Name', stop: '^Uphill Routes', name: 0, status: 1,
    updated: { sel: '.g-cols.wpb_row:not(:has(.g-cols.wpb_row))', re: 'Snow Report Updated at\\s*(\\d{4}-\\d{2}-\\d{2})' },
    note: '.idl_gf_input_6' }),
  'ragged': rows('https://www.raggedmountainresort.com/mountain-report-cams/', {
    scope: 'table:has(th:contains("Lift Name"))', row: 'tbody tr', name: 0, status: 2,
    updated: { sel: '.report-announcement .title-date span', stale: false }, note: '.report-announcement .card-body' }),
  'camden-snow-bowl': rows('https://camdensnowbowl.com/current-conditions/', {
    scope: 'body', row: '.mcb-wrap:has(h3.title)', name: ['h3.title', 'h4.title'], status: 'h4.title:last', strict: true,
    updated: { sel: '.mcb-wrap:has(h2.title) h2.title', stale: false }, note: '.mcb-wrap:has(h2.title) .column_attr' }),
  'big-moose': rows('https://skibigmoose.com/trail-report-1', {
    scope: '.menu-category', scopeMatch: '^Lifts', row: '[data-aid^="MENU_ITEM_"]:not([data-aid*="CONTAINER"])',
    name: 'h4', status: '[data-aid$="_PRICE"]', strict: true,
    updated: { sel: 'p:contains("Last Updated")', re: 'Last Updated\\s*:?\\s*([\\d/ ]+)' } }),
  'powder-ridge': rows('https://powderridgepark.com/trail-report/', {
    scope: '.sc-rs-section', scopeMatch: '^Lifts', row: '.sc-rs-cardv', name: '.sc-rs-cardv__name', status: '.sc-rs-pill',
    updated: { sel: '.sc-rs-conditions__updated' } }),
  'saskadena-six': rows('https://www.saskadenasix.com/winter/conditions', {
    scope: '.lifts-trails .content', row: 'h2, article.node--type-lift-trail', start: '^Lifts$', stop: '^Trails$',
    name: '.title', status: '.status', note: '.intro' }),
  // Lift list is an iframe on the resort's own site; open = check icon, closed = "remove" icon (the page's own legend).
  'catamount': rows('https://catamountski.com/winter/the-mountain/mountain-conditions', {
    scope: '.accordion-item', scopeMatch: '^Lifts', row: '.col-03', name: '', status: 'i', statusFrom: 'class',
    map: { open: '\\bfa-check\\b', closed: '\\bfa-(remove|times|close|ban)\\b' } },
    'https://catamountski.com/lift-status?tmpl=component'),
  // Report is an iframe from the resort's report vendor; icons pti-open / pti-closed / pti-hold (the page's own legend).
  'tenney': rows('https://skitenney.com/snow-report/', {
    scope: '.SnowReport-section--lifts', row: 'article.SnowReport-Lift', name: 'h3', status: '.SnowReport-item-status', statusFrom: 'class',
    map: { open: '\\bpti-open\\b', closed: '\\bpti-closed\\b', hold: '\\bpti-hold\\b' },
    updated: { sel: '#writtenTime .update-info', stale: false }, note: '.SnowReport-section--written' },
    'https://skitenney.propapps.io/snow-report/'),

  // ---- other layouts ----
  'ski-bradford': rows('https://skibradford.com/snow-report/', {
    mode: 'columns', scope: '.snowReportTrails', col: '.uk-grid > div', head: '.uk-text-large', item: '.uk-panel',
    nameHead: '^LIFTS$', statusHead: '^STATUS$',
    updated: { sel: '.snowReportPage .uk-panel', re: 'Date\\s*(\\d{4}-\\d{2}-\\d{2})' } }),
  'black-mountain-nh': rows('https://www.blackmt.com/conditions', {
    mode: 'pairs', item: '[data-testid="richTextElement"]', start: '^LIFTS$', stop: '^BEGINNER$' }),
  'bousquet': { url: 'https://bousquetmountain.com/lift-trail-status/', parser: 'bousquet' },
  'whaleback': { url: 'https://www.whaleback.com/trail-report', parser: 'sheetcsv',
    feed: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfwVYiMuY-cJ5JnFm4pJm1Xs94I7Yfl2KJsCsBGOgTP99octXx3JxyYIur1xQCZKn4r8zOx14JXU2k/pub?gid=0&single=true&output=csv' },

  // ---- no per-lift list published: only the area's own "closed for the season" statement is read ----
  'black-mountain-me': flag('https://skiblackmountain.org/mountain-report', {
    sel: '.sqs-html-content:has(h2:contains("Mountain Report"))', re: 'the mountain is ' + SEASON, note: '.sqs-html-content:has(h2:contains("Mountain Report")) p' }),
  'mcintyre': flag('https://www.mcintyreskiarea.com/mountain-report/', { sel: '.pp-info-table', re: '^Lifts\\s*' + SEASON }),
  'ski-ward': flag('https://skiward.com/mountain-info/conditions/', { sel: '.wpb_text_column p', re: '^Notes:\\s*' + SEASON }),
  'yawgoo-valley': flag('https://yawgoo.com/winter/report/', {
    sel: '.fl-callout:has(.fl-callout-title:contains("ski area")) .fl-callout-text', re: '^' + SEASON, note: '.fl-callout:has(.fl-callout-title:contains("ski area")) .fl-callout-text' }),
};
