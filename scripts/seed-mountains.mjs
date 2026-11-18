// One-time seed for data/mountains.json. Coordinates are refined by fetch-lifts.mjs
// from OpenStreetMap lift geometry. Elevations in feet.
import { writeFileSync } from 'node:fs';
const rows = `
stowe|Stowe|VT|44.5303|-72.7814|1265|3625|https://www.stowe.com
smugglers-notch|Smugglers' Notch|VT|44.5886|-72.7900|1030|3640|https://www.smuggs.com
jay-peak|Jay Peak|VT|44.9379|-72.5045|1815|3968|https://jaypeakresort.com
burke|Burke Mountain|VT|44.5800|-71.8990|1210|3267|https://skiburke.com
sugarbush|Sugarbush|VT|44.1357|-72.8944|1483|4083|https://www.sugarbush.com
mad-river-glen|Mad River Glen|VT|44.2025|-72.9175|1600|3637|https://www.madriverglen.com
bolton-valley|Bolton Valley|VT|44.4215|-72.8497|1446|3150|https://www.boltonvalley.com
killington|Killington|VT|43.6200|-72.8000|1165|4241|https://www.killington.com
pico|Pico Mountain|VT|43.6619|-72.8430|1967|3967|https://www.picomountain.com
okemo|Okemo|VT|43.4018|-72.7170|1144|3344|https://www.okemo.com
mount-snow|Mount Snow|VT|42.9602|-72.9204|1900|3600|https://www.mountsnow.com
stratton|Stratton|VT|43.1134|-72.9081|1872|3875|https://www.stratton.com
bromley|Bromley|VT|43.2278|-72.9382|1950|3284|https://www.bromley.com
magic-mountain|Magic Mountain|VT|43.2017|-72.7726|1350|2850|https://magicmtn.com
saskadena-six|Saskadena Six|VT|43.6650|-72.5433|550|1200|https://www.saskadenasix.com
middlebury-snowbowl|Middlebury Snowbowl|VT|43.9390|-72.9577|1720|2720|https://www.middleburysnowbowl.com
cochrans|Cochran's Ski Area|VT|44.3927|-72.9826|500|850|https://www.cochranskiarea.com
northeast-slopes|Northeast Slopes|VT|44.0640|-72.2280|900|1260|https://www.northeastslopes.org
quechee|Quechee Ski Area|VT|43.6420|-72.4030|600|1250|https://quecheeclub.com
lyndon-outing-club|Lyndon Outing Club|VT|44.5360|-71.9760|800|1233|https://www.skilyndon.com
ascutney|Ascutney Outdoors|VT|43.4400|-72.4550|800|1250|https://www.ascutneyoutdoors.org
bretton-woods|Bretton Woods|NH|44.2580|-71.4640|1600|3100|https://www.brettonwoods.com
cannon|Cannon Mountain|NH|44.1565|-71.6985|1900|4080|https://www.cannonmt.com
loon|Loon Mountain|NH|44.0364|-71.6214|950|3050|https://www.loonmtn.com
waterville-valley|Waterville Valley|NH|43.9656|-71.5278|1984|4004|https://www.waterville.com
wildcat|Wildcat Mountain|NH|44.2640|-71.2394|1950|4062|https://www.skiwildcat.com
attitash|Attitash|NH|44.0828|-71.2294|600|2350|https://www.attitash.com
cranmore|Cranmore|NH|44.0570|-71.1100|800|2000|https://www.cranmore.com
black-mountain-nh|Black Mountain|NH|44.1670|-71.1640|1250|2350|https://www.blackmt.com
king-pine|King Pine|NH|43.8700|-71.0900|500|850|https://www.kingpine.com
gunstock|Gunstock|NH|43.5420|-71.3630|900|2267|https://www.gunstock.com
ragged|Ragged Mountain|NH|43.5010|-71.8420|1000|2250|https://www.raggedmountainresort.com
mount-sunapee|Mount Sunapee|NH|43.3310|-72.0800|1233|2743|https://www.mountsunapee.com
pats-peak|Pats Peak|NH|43.1590|-71.7960|690|1460|https://www.patspeak.com
crotched|Crotched Mountain|NH|43.0020|-71.8790|1050|2066|https://www.crotchedmtn.com
mcintyre|McIntyre Ski Area|NH|43.0040|-71.4330|400|600|https://www.mcintyreskiarea.com
whaleback|Whaleback|NH|43.6030|-72.1780|1100|1800|https://www.whaleback.com
dartmouth-skiway|Dartmouth Skiway|NH|43.7860|-72.1000|975|1943|https://sites.dartmouth.edu/skiway
tenney|Tenney Mountain|NH|43.7400|-71.7870|749|2149|https://www.skitenney.com
granite-gorge|Granite Gorge|NH|42.9720|-72.2060|800|1325|https://www.granitegorge.com
sugarloaf|Sugarloaf|ME|45.0314|-70.3131|1417|4237|https://www.sugarloaf.com
sunday-river|Sunday River|ME|44.4734|-70.8569|800|3140|https://www.sundayriver.com
saddleback|Saddleback|ME|44.9367|-70.5270|2120|4120|https://www.saddlebackmaine.com
mt-abram|Mt. Abram|ME|44.3790|-70.7070|1100|2250|https://www.mtabram.com
pleasant-mountain|Pleasant Mountain|ME|44.0590|-70.8150|600|1900|https://www.pleasantmountain.com
lost-valley|Lost Valley|ME|44.1290|-70.2800|255|495|https://www.lostvalleyski.com
black-mountain-me|Black Mountain of Maine|ME|44.5820|-70.6120|970|2350|https://www.skiblackmountain.org
camden-snow-bowl|Camden Snow Bowl|ME|44.2160|-69.1350|150|1080|https://camdensnowbowl.com
big-moose|Big Moose Mountain|ME|45.5050|-69.7050|1750|2400|https://www.skibigmoose.com
titcomb|Titcomb Mountain|ME|44.6560|-70.1800|400|750|https://www.titcombmountain.com
hermon|Hermon Mountain|ME|44.7750|-68.9300|100|450|https://www.skihermonmountain.com
bigrock|Bigrock Mountain|ME|46.5080|-67.8260|670|1650|https://www.bigrockmaine.com
lonesome-pine|Lonesome Pine Trails|ME|47.2480|-68.5900|550|1050|https://www.lonesomepines.org
wachusett|Wachusett Mountain|MA|42.5030|-71.8860|1006|2006|https://www.wachusett.com
jiminy-peak|Jiminy Peak|MA|42.5550|-73.2920|1230|2380|https://www.jiminypeak.com
berkshire-east|Berkshire East|MA|42.6210|-72.8770|660|1840|https://berkshireeast.com
catamount|Catamount|MA|42.1690|-73.4770|1000|2000|https://catamountski.com
butternut|Ski Butternut|MA|42.1830|-73.3210|800|1800|https://www.skibutternut.com
bousquet|Bousquet Mountain|MA|42.4180|-73.2770|1125|1875|https://bousquetmountain.com
otis-ridge|Otis Ridge|MA|42.1960|-73.0900|1300|1700|https://www.otisridge.com
nashoba-valley|Nashoba Valley|MA|42.5400|-71.4440|200|440|https://skinashoba.com
blue-hills|Blue Hills|MA|42.2140|-71.1170|325|635|https://www.bluehillsboston.com
ski-bradford|Ski Bradford|MA|42.7830|-71.0560|100|348|https://skibradford.com
ski-ward|Ski Ward|MA|42.3020|-71.6830|420|640|https://www.skiward.com
mohawk-mountain|Mohawk Mountain|CT|41.8370|-73.3120|960|1600|https://www.mohawkmtn.com
ski-sundown|Ski Sundown|CT|41.8850|-72.9470|450|1075|https://www.skisundown.com
mount-southington|Mount Southington|CT|41.5830|-72.9240|225|525|https://www.mountsouthington.com
powder-ridge|Powder Ridge|CT|41.5020|-72.7380|225|720|https://powderridgepark.com
yawgoo-valley|Yawgoo Valley|RI|41.5180|-71.5380|70|315|https://www.yawgoo.com
`.trim().split('\n').map(l => { const [id,name,state,lat,lon,base,summit,url] = l.split('|');
  return { id, name, state, lat:+lat, lon:+lon, baseFt:+base, summitFt:+summit, url }; });
writeFileSync(new URL('../data/mountains.json', import.meta.url), JSON.stringify(rows, null, 1));
console.log(rows.length, 'mountains');
