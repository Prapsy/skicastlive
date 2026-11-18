// Group A adapters. Entries here override scripts/sources/config.mjs.
const boyne = (host, code) => ({ url: `https://www.${host}/mountain-report`, feed: `https://www.${host}/api/reportpal?resortName=${code}&useReportPal=true`, parser: 'boyne' });
export const SOURCES = {
  'loon': boyne('loonmtn.com', 'lm'),
  'sugarloaf': boyne('sugarloaf.com', 'sl'),
  'sunday-river': boyne('sundayriver.com', 'sr'),
  'pleasant-mountain': boyne('pleasantmountain.com', 'pm'),
  'cannon': { url: 'https://www.cannonmt.com/mountain-report', parser: 'nextcraft' },
  'bromley': { url: 'https://bromley.com/snow-report', parser: 'nextcraft' },
  'saddleback': { url: 'https://www.saddlebackmaine.com/mountain-report/', feed: 'https://saddlebackapi.netlify.app/.netlify/functions/getAll', parser: 'saddleback' },
  // Same conditions widget: in the page at Gunstock, in an iframe on a resort-owned host (feed) at the others.
  'gunstock': { url: 'https://www.gunstock.com/winter/snow-report/', parser: 'ptireport' },
  'bolton-valley': { url: 'https://www.boltonvalley.com/winter/trail-maps-snow-reports/snow-reports/', feed: 'https://snow.boltonvalley.com/snow-report/snow/snow-report/', parser: 'ptireport' },
  'jay-peak': { url: 'https://jaypeakresort.com/skiing-riding/snow-report-maps/snow-report', feed: 'https://digital.jaypeakresort.com/conditions/snow-report/snow-report/', parser: 'ptireport' },
  'king-pine': { url: 'https://www.kingpine.com/the-mountain/snow-report/', feed: 'https://conditions.kingpine.com/conditions/snow-report/', parser: 'ptireport' },
  'waterville-valley': { url: 'https://www.waterville.com/snow-report-maps', feed: 'https://features.waterville.com/propsnow', parser: 'ptireport' },
  'bretton-woods': { url: 'https://www.brettonwoods.com/snow-trail-report/', parser: 'brettonwoods' },
  'cranmore': { url: 'https://cranmore.com/snow-report', parser: 'cranmore' },
  'burke': { url: 'https://skiburke.com/lift-trail-status', parser: 'burke' },
  'smugglers-notch': { url: 'https://www.smuggs.com/conditions/winter-report/', parser: 'smuggs' },
  'magic-mountain': { url: 'https://www.magicmtn.com/snow-report', parser: 'magic' },
  'wachusett': { url: 'https://www.wachusett.com/the-mountain/your-visit/snow-report/', parser: 'wachusett' },
};
