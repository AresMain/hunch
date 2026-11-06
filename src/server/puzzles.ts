// Seed puzzle bank. SERVER-ONLY: never import from client code.
// Depth 1 (Topside) → 5 (The Abyss): every round goes one step deeper and
// harder. Each puzzle has three clues: subtle, distinctive, near-reveal (the
// last is only buyable in the final seconds). Signal Maps are editor-ranked,
// closest first, and must not contain the answer or its word forms.

import { existsSync, readFileSync } from 'node:fs';
import type { Depth, Puzzle } from '../shared/types';

function P(
  answer: string,
  depth: Depth,
  aliases: string[],
  category: string,
  definition: string,
  fallback: string,
  clues: [string, string, string],
  strong: string,
  weak: string,
): Puzzle {
  return {
    id: answer,
    answer,
    aliases,
    depth,
    category,
    definition,
    fallback,
    clues,
    strong: strong.trim().split(/\s+/),
    weak: weak.trim().split(/\s+/),
  };
}

export const PUZZLES: Puzzle[] = [
  // ------------------------------------------------------------ 1 · Topside
  P('lighthouse', 1, ['lighthouses', 'light house'], 'Places',
    'A tower with a powerful lamp that guides ships away from danger.',
    'Something that stands alone beside the water.',
    ['It keeps its eye open all night.', 'It turns, but it never leaves its post.', 'A tall coastal tower with a rotating lamp.'],
    'beacon keeper lamp lens foghorn coast shipwreck cliff harbor tower',
    'sea ocean ship sailor storm night rocks island boat navigation warning spiral stairs wave port fog guide shore'),
  P('volcano', 1, ['volcanoes', 'volcanos'], 'Nature',
    'An opening in the earth’s crust through which molten rock, ash and gas escape.',
    'Something the earth does when it loses its temper.',
    ['It can sleep for centuries.', 'Pompeii learned about it the hard way.', 'A mountain that erupts with lava.'],
    'lava magma eruption crater erupt ash pompeii vesuvius molten',
    'mountain fire island smoke rock hot explosion earthquake hawaii heat dormant geology cone sulfur tectonic disaster'),
  P('umbrella', 1, ['umbrellas', 'brolly'], 'Objects',
    'A folding canopy on a stick, used for protection from rain or sun.',
    'Something you carry but rarely think about.',
    ['It spends most of its life closed and waiting.', 'Wind is its natural enemy.', 'You hold it over your head in a downpour.'],
    'rain parasol canopy drizzle downpour shelter wet handle',
    'weather sun shade cloud coat boots wind fold cover puddle storm cocktail beach raincoat dry stick'),
  P('candle', 1, ['candles'], 'Objects',
    'A stick of wax with a central wick that is lit to give light.',
    'Something that shrinks every time it’s used.',
    ['It gives itself away to help you see.', 'One breath can end it.', 'A stick of wax that burns slowly.'],
    'wax wick flame birthday melt match vigil lantern chandelier',
    'light fire cake dinner romantic scent darkness burn smoke church glow lamp torch blackout wish altar'),

  P('backpack', 1, ['backpacks'], 'Objects',
    'A bag carried on the back, held by shoulder straps.',
    'Something that rides along with you every day.',
    ['It hugs you from behind all day.', 'Students and hikers can’t do without one.', 'A bag you wear on your shoulders.'],
    'straps zipper school hiking luggage satchel rucksack bag',
    'books travel carry shoulder pocket camping student laptop trip heavy lunch hiker canvas nylon gear water'),
  P('telescope', 1, ['telescopes'], 'Space',
    'An instrument that uses lenses or mirrors to make distant objects appear nearer.',
    'Something that brings the far away close.',
    ['It lets you see things that are very far away.', 'Galileo pointed one at Jupiter.', 'A tube with lenses for looking at stars.'],
    'stars lens astronomy planet observatory galaxy hubble zoom',
    'sky night moon space binoculars mirror pirate magnify distance tripod comet orbit view eye gaze universe'),
  P('bridge', 1, ['bridges'], 'Places',
    'A structure built to carry a path or road across a river, road or gap.',
    'Something that connects two sides.',
    ['It lets you cross without getting wet.', 'Some hang from cables, some lift up, some are made of playing cards.', 'A structure that carries a road over a river.'],
    'river cross span suspension arch golden toll overpass',
    'road water connect steel cable troll gap canyon stone link tower traffic ferry crossing build engineer'),
  P('thunder', 1, [], 'Nature',
    'The loud rumbling sound that follows a flash of lightning.',
    'Something you hear after you see it.',
    ['It always arrives just after its bright partner.', 'Count the seconds to know how far away the storm is.', 'The booming sound that follows lightning.'],
    'lightning storm rumble boom loud clap bolt rain',
    'cloud sky weather sound noise dark scary thor flash electricity drum roar heavy night dog'),

  // ---------------------------------------------------------- 2 · The Lanes
  P('compass', 2, ['compasses'], 'Objects',
    'An instrument with a magnetized needle that points to magnetic north.',
    'A small tool that has saved many lost travelers.',
    ['It always knows which way it’s facing, even when you don’t.', 'There’s a version for drawing perfect circles.', 'Its magnetized needle points north.'],
    'north needle magnetic navigation direction bearing map south explorer',
    'east west magnet hiking sailor ship lost travel geometry circle arc point guide orienteering pole adventure'),
  P('anchor', 2, ['anchors'], 'Objects',
    'A heavy device dropped from a vessel to hold it in place.',
    'Something heavy that keeps things steady.',
    ['It does its best work by refusing to move.', 'It’s a classic tattoo, and also the person who reads you the news.', 'A heavy iron hook that holds a ship in place.'],
    'ship chain harbor boat sailor dock moor weigh hook tattoo',
    'sea ocean heavy iron port navy drop stable news rope rust bottom steady captain cruise crew'),
  P('mirror', 2, ['mirrors', 'looking glass'], 'Objects',
    'A reflective surface, usually silvered glass, that shows an image of what is in front of it.',
    'Something found in nearly every bathroom.',
    ['It shows you everything except itself.', 'Breaking one supposedly costs you seven years.', 'Silvered glass you check your hair in.'],
    'reflection glass image vanity reverse silver bathroom symmetry',
    'face look makeup wall shine light luck broken seven fairy magic narcissus frame window twin copy flip'),
  P('shadow', 2, ['shadows'], 'Phenomena',
    'A dark area produced when an object blocks a source of light.',
    'Something everyone has but no one can touch.',
    ['It follows you everywhere but vanishes in the dark.', 'A groundhog checks for it every February.', 'The dark shape you cast when you block the light.'],
    'silhouette shade dark light sun puppet eclipse follow',
    'night ghost black sundial cast tree figure outline groundhog spy stalk mystery wall noon evening darkness'),

  P('passport', 2, ['passports'], 'Objects',
    'An official document that identifies a traveler and lets them cross borders.',
    'A small booklet with a lot of power.',
    ['It has your face in it, and a lot of stamps.', 'Lose it abroad and your trip gets complicated.', 'The document you show at border control.'],
    'travel border visa stamp airport customs citizenship identity',
    'photo document trip country flight abroad booklet government expire immigration tourist id vacation official holiday'),
  P('kaleidoscope', 2, ['kaleidoscopes'], 'Objects',
    'A tube of mirrors and loose colored glass that shows changing symmetrical patterns.',
    'A toy that is mostly about looking.',
    ['Turn it and the world rearranges itself.', 'Mirrors inside multiply a few colored scraps into endless patterns.', 'A tube toy that makes shifting symmetrical patterns.'],
    'mirrors patterns colors symmetry tube toy prism fractal',
    'glass rainbow beads turn rotate shapes psychedelic bright vision eye child pretty trippy reflection colorful design'),
  P('hourglass', 2, ['hourglasses'], 'Objects',
    'A device that measures time by sand flowing between two glass bulbs.',
    'Something that is always running out.',
    ['Flip it over and it starts again.', 'Its narrow waist is famous.', 'Sand falling between two glass bulbs to measure time.'],
    'sand time timer glass flip minutes egg countdown',
    'clock wait patience old figure waist pour fall bulb measure past antique sundial deadline grains'),
  P('scarecrow', 2, ['scarecrows'], 'Places',
    'A figure dressed in old clothes, set up in a field to frighten birds from crops.',
    'Someone who stands in a field all day.',
    ['It stands guard all season without ever moving.', 'On the road to the Emerald City, it wanted a brain.', 'A straw figure that frightens birds away from crops.'],
    'crows straw field farm crops birds hay pumpkin',
    'halloween scary corn hat stick farmer autumn harvest oz clothes guard creepy man figure rags'),
  P('avalanche', 2, ['avalanches'], 'Nature',
    'A large mass of snow and ice falling rapidly down a mountainside.',
    'Something that starts small and grows fast.',
    ['One loud noise can set it off.', 'Backcountry skiers carry beacons because of it.', 'A rush of snow sliding down a mountain.'],
    'snow mountain slide ski collapse landslide alps rescue',
    'ice cold winter danger cascade rush rolling disaster slope buried peak flood rumble beacon storm'),
  P('treasure', 2, ['treasures'], 'Myth',
    'A hoard of valuable things such as gold and jewels, often hidden.',
    'Something worth digging for.',
    ['X marks the spot.', 'Pirates buried theirs and drew maps to it.', 'A hidden chest of gold and jewels.'],
    'gold chest pirate map jewels buried hunt coins',
    'island rich money diamond dig hidden secret quest pearl loot booty spade shovel crown fortune'),

  // ---------------------------------------------------------- 3 · Undercity
  P('echo', 3, ['echoes'], 'Phenomena',
    'A sound that is reflected off a surface and heard again.',
    'Something you can make but can never hold.',
    ['It always has the last word, though it never speaks first.', 'In myth, a nymph was cursed to become this.', 'A sound that bounces back to you.'],
    'canyon cave repeat reverberation reflection bounce sonar sound voice',
    'mountain valley shout hollow empty nymph return delay mimic answer hall tunnel ring bat whisper narcissus'),
  P('glacier', 3, ['glaciers'], 'Nature',
    'A slowly moving mass of ice formed from compacted snow over many years.',
    'Something very old, very cold, and on the move.',
    ['It moves, but you’d never see it happen.', 'When it reaches the sea, it calves.', 'A slow river of ice.'],
    'ice iceberg frozen melt crevasse snow polar arctic antarctica',
    'cold mountain water climate warming river valley slow blue freeze winter tundra avalanche cave alaska calving'),
  P('orchestra', 3, ['orchestras'], 'Culture',
    'A large group of musicians playing classical instruments together, led by a conductor.',
    'Something best enjoyed in a big hall.',
    ['Dozens of people, one voice.', 'Its leader faces away from the audience.', 'A large group of classical musicians led by a conductor.'],
    'symphony conductor violin musicians concert cello baton philharmonic strings',
    'music instrument trumpet flute drum opera classical harp oboe stage pit band ensemble tuba score bow'),
  P('phoenix', 3, ['phoenixes'], 'Myth',
    'A mythical bird that bursts into flame and is reborn from its own ashes.',
    'A creature that refuses to stay gone.',
    ['It ends every life in fire, by choice.', 'Its tears were said to heal any wound.', 'A mythical firebird reborn from its own ashes.'],
    'firebird ashes rebirth flames reborn mythical immortal feathers resurrection',
    'bird fire myth legend burn rise sun egypt gold red eternal magic wings nest comeback arizona'),
  P('insomnia', 3, [], 'Body',
    'Persistent difficulty falling or staying asleep.',
    'A problem that shows up at bedtime.',
    ['The clock becomes your enemy at 3 a.m.', 'Counting sheep is the folk remedy.', 'The condition of being unable to sleep.'],
    'sleepless awake sleep night tired restless melatonin exhaustion bedtime',
    'bed pillow dream coffee caffeine clock dark owl stress worry sheep yawn nap pills tossing midnight'),

  P('silhouette', 3, ['silhouettes'], 'Phenomena',
    'The dark shape and outline of something seen against a lighter background.',
    'Something seen only by its edges.',
    ['It tells you who it is without showing a single detail.', 'Sunsets turn everything into one.', 'A dark outline against a bright background.'],
    'shadow outline shape profile backlight dark sunset contour',
    'black figure light edge cutout portrait form shade sun window curtain dancer mystery side sketch cast'),
  P('quicksand', 3, [], 'Nature',
    'Loose, waterlogged sand that gives way under weight and traps whatever sinks in.',
    'Ground that can’t be trusted.',
    ['The more you struggle, the worse it gets.', 'Old adventure films made it seem far more common than it is.', 'Wet ground that sucks you down.'],
    'sinking trap swamp mud bog sand stuck marsh',
    'jungle danger struggle desert wet ground pit escape adventure movie death slow pull rope explorer mire'),
  P('whirlpool', 3, ['whirlpools'], 'Nature',
    'A rapidly rotating mass of water that can pull objects down.',
    'Something that never stops turning.',
    ['It drags anything that comes too close toward its center.', 'Sailors in myth feared Charybdis.', 'Water spinning in a powerful circle.'],
    'vortex spiral water spin current maelstrom drain charybdis',
    'ocean sea boat sink swirl circle tide river danger jacuzzi bath tornado funnel ship storm eddy'),
  P('compassion', 3, [], 'Feelings',
    'Sympathetic concern for the suffering of others.',
    'A feeling aimed at someone else.',
    ['It’s what makes you stop for a stranger.', 'Its roots mean, roughly, “to suffer with.”', 'Deep sympathy and care for others’ suffering.'],
    'empathy kindness sympathy mercy care pity understanding love',
    'heart warmth help charity gentle kind feeling tender support emotion humane forgiveness grace comfort nurse'),
  P('migration', 3, ['migrations'], 'Nature',
    'The seasonal movement of animals from one region to another.',
    'A long journey that happens again and again.',
    ['Every year millions leave, and every year they come back.', 'Geese write a V across the sky because of it.', 'Animals moving to a new region with the seasons.'],
    'birds journey seasonal geese flock travel south herd',
    'move winter summer wildebeest whale butterfly monarch salmon route north animals flight nomad home instinct'),
  P('mosaic', 3, ['mosaics'], 'Culture',
    'A picture or pattern made from small pieces of colored stone, glass or tile.',
    'Something made of many small pieces.',
    ['Up close it’s chaos; step back and it’s a picture.', 'Byzantine churches are covered in gold ones.', 'A picture made from tiny tiles.'],
    'tiles pieces tesserae pattern glass art byzantine fragments',
    'picture colorful stone floor wall church roman puzzle design craft collage ceramic shards image decorate pixel'),
  P('masquerade', 3, ['masquerades'], 'Culture',
    'A party or ball at which guests wear masks and costumes.',
    'A party where nobody is quite themselves.',
    ['Everyone came, but nobody knows who came.', 'Venice made its carnival famous for it.', 'A ball where guests wear masks.'],
    'mask ball disguise costume venice carnival party dance',
    'hidden secret identity feathers opera phantom gown masked elegant mystery gala waltz pretend role anonymous'),

  // ----------------------------------------------------------- 4 · The Sump
  P('labyrinth', 4, ['labyrinths'], 'Myth',
    'An intricate network of winding paths, especially one designed to be hard to escape.',
    'Something designed to make you lost.',
    ['Getting in is easy. Getting out is the whole point.', 'A creature with a bull’s head was kept at its heart.', 'An intricate maze, famously on Crete.'],
    'maze minotaur theseus crete corridors passages puzzle paths',
    'hedge garden lost confusing complex myth thread walls turn exit monster ancient greek trap wander riddle daedalus'),
  P('eclipse', 4, ['eclipses'], 'Space',
    'The obscuring of one celestial body by another, as when the moon passes between the earth and the sun.',
    'Something that happens in the sky, but not every day.',
    ['It turns day into night for a few minutes.', 'You need special glasses to watch it safely.', 'When the moon blocks the sun.'],
    'sun moon solar lunar totality corona shadow darkness astronomy',
    'sky space orbit planet dark block rare glasses telescope celestial cosmic alignment star overshadow omen daytime'),
  P('alchemy', 4, [], 'History',
    'The medieval forerunner of chemistry, concerned with transmuting matter, especially base metals into gold.',
    'An old pursuit that mixed science with magic.',
    ['It was a science before it was a fantasy.', 'Isaac Newton spent years secretly practicing it.', 'The medieval art of turning lead into gold.'],
    'gold lead philosopher potion transmutation elixir mercury sulfur',
    'magic chemistry science medieval wizard stone immortality laboratory cauldron mystic occult metal experiment flask secret transform'),
  P('mirage', 4, ['mirages'], 'Phenomena',
    'An optical illusion caused by hot air bending light, often seen as distant water.',
    'Something you see that isn’t really there.',
    ['Thirsty travelers chase it and never arrive.', 'It’s real light, just bent by heat.', 'A desert illusion that looks like water.'],
    'desert illusion oasis heat shimmer hallucination optical thirst',
    'sand sun water camel horizon road hot fake dream vision trick distance refraction sahara dune wave'),
  P('vertigo', 4, [], 'Body',
    'A sensation of spinning or losing balance, often triggered by heights.',
    'A feeling that the floor is no longer trustworthy.',
    ['The room moves even though you don’t.', 'Hitchcock named a film after it.', 'A spinning dizziness, often from heights.'],
    'dizziness dizzy spinning heights balance nausea hitchcock fall',
    'height cliff edge ear sick fear ledge ladder tower sway unsteady rooftop swirl faint giddy acrophobia'),
  P('chimera', 4, ['chimeras', 'chimaera'], 'Myth',
    'A mythical fire-breathing monster made of different animals; also any impossible hybrid.',
    'Something stitched together from parts that don’t belong.',
    ['It has a lion’s head, but not a lion’s body.', 'A hero on a winged horse brought it down.', 'A mythical hybrid monster: lion, goat and serpent.'],
    'hybrid monster lion goat serpent myth beast bellerophon',
    'greek creature fire dragon snake illusion fantasy mixture genetics legend fusion pegasus impossible dream mutant'),
  P('catalyst', 4, ['catalysts'], 'Science',
    'A substance that speeds up a reaction without being consumed; anything that triggers change.',
    'Something that makes things happen faster.',
    ['It changes everything and stays the same itself.', 'Your car’s exhaust system contains one.', 'A substance that speeds up a chemical reaction.'],
    'reaction chemistry enzyme accelerate trigger spark converter chemical',
    'change speed science lab molecule agent start cause fuel platinum process boost ignite element experiment revolution'),
  P('prism', 4, ['prisms'], 'Science',
    'A transparent solid that bends light and splits it into a spectrum.',
    'Something that reveals what light is hiding.',
    ['It takes something plain and shows it was never plain at all.', 'A famous album cover features one.', 'A glass shape that splits white light into a rainbow.'],
    'rainbow spectrum light refraction glass crystal triangle colors',
    'optics physics lens beam newton color shine sparkle mirror wavelength laser album diamond split bend sun'),

  P('sabotage', 4, [], 'Ideas',
    'Deliberately destroying, damaging or obstructing something, especially for an advantage.',
    'Damage that was no accident.',
    ['Someone made sure it would fail.', 'Legend says the word comes from wooden shoes thrown into machines.', 'Deliberate destruction to undermine something.'],
    'destroy undermine wreck betray spy damage traitor attack',
    'plan secret enemy war machine bomb factory strike crime agent plot ruin deliberate shoes rebel spanner'),
  P('camouflage', 4, [], 'Nature',
    'Coloring or disguise that lets something blend into its surroundings.',
    'A way to be there without being seen.',
    ['It works best when nobody notices it.', 'Chameleons and octopuses are masters of it.', 'Coloring or disguise that blends into the background.'],
    'hide blend disguise chameleon military hidden stealth concealment',
    'green army soldier jungle pattern invisible octopus color nature hunter animal spots stripes forest uniform sniper'),
  P('hologram', 4, ['holograms'], 'Science',
    'A three-dimensional image formed by the interference of light beams.',
    'Something that looks solid but isn’t.',
    ['You can walk around it, but you can never touch it.', 'Credit cards carry a tiny one to stop forgers.', 'A three-dimensional image made of light.'],
    'laser light projection three dimensional image virtual illusion',
    'future fiction screen display message card shimmer beam technology fake simulation sticker visual rainbow optical ghost'),
  P('tsunami', 4, ['tsunamis'], 'Nature',
    'A long, high sea wave caused by an earthquake or other undersea disturbance.',
    'Something the sea sends after the ground shakes.',
    ['The sea pulls back first, as if taking a breath.', 'Its name means “harbor wave” in Japanese.', 'A giant wave caused by an undersea earthquake.'],
    'wave earthquake flood ocean tidal surge disaster coast',
    'water sea japan destruction warning evacuate beach tide underwater wall giant siren crash rush tremor island'),
  P('cartography', 4, [], 'Science',
    'The science and art of making maps.',
    'A craft that shrinks the world onto paper.',
    ['Its makers once wrote “here be dragons” at the edges.', 'Mercator’s projection is its most famous argument.', 'The art of drawing maps.'],
    'maps atlas mercator geography globe projection compass survey',
    'paper explorer coast border latitude longitude scale legend terrain chart navigation world drawing land territory'),
  P('ventriloquist', 4, ['ventriloquists'], 'Culture',
    'An entertainer who makes their voice seem to come from a dummy.',
    'A performer who never moves their lips.',
    ['Their partner always gets the laughs.', 'They talk without moving their lips.', 'A performer who throws their voice into a dummy.'],
    'dummy puppet voice lips throw comedian doll act',
    'stage show talk mouth creepy wooden lap speak trick illusion entertainer circus vaudeville laugh hand'),

  // ---------------------------------------------------------- 5 · The Abyss
  P('nostalgia', 5, [], 'Feelings',
    'A sentimental longing or wistful affection for a period in the past.',
    'A feeling, not a thing.',
    ['It hurts in a way people actually enjoy.', 'Its name comes from Greek words for “homecoming” and “pain.”', 'A sentimental longing for the past.'],
    'memories past longing childhood wistful reminisce yearning retro vintage',
    'old remember home sentimental sad bittersweet photograph album history homesick youth throwback sepia emotion feeling memory'),
  P('paradox', 5, ['paradoxes'], 'Ideas',
    'A statement or situation that seems self-contradictory yet may be true.',
    'Something that makes your brain hurt.',
    ['It argues with itself and somehow wins.', '“This statement is false” is a famous example.', 'A self-contradictory statement or situation.'],
    'contradiction logic impossible contrary philosophy irony absurd oxymoron puzzle',
    'time travel grandfather liar mind riddle loop conflict strange theory zeno mystery confusing opposite truth think'),
  P('entropy', 5, [], 'Science',
    'A measure of disorder; the tendency of systems to move from order to chaos.',
    'Something that always increases, whether you like it or not.',
    ['Your room obeys it every week.', 'The second law of thermodynamics is about it.', 'The measure of disorder in a system.'],
    'disorder chaos thermodynamics decay randomness physics heat energy',
    'order mess universe time law science system information death collapse degrade arrow cosmos equilibrium decline rust'),
  P('serendipity', 5, [], 'Ideas',
    'The occurrence of happy discoveries by chance.',
    'A lucky accident.',
    ['You find it while looking for something else.', 'Penicillin owes its discovery to it.', 'A happy accident; a fortunate chance discovery.'],
    'luck chance coincidence fortune accident discovery fate happenstance',
    'lucky happy surprise random destiny fluke penicillin karma magic unexpected find stumble blessing timing romance meeting'),
  P('epiphany', 5, ['epiphanies'], 'Ideas',
    'A sudden, striking realization or insight.',
    'Something that arrives all at once.',
    ['It usually arrives in the shower, never at your desk.', 'Archimedes shouted about his in a bathtub.', 'A sudden moment of realization.'],
    'realization insight eureka revelation understanding lightbulb aha sudden',
    'idea moment clarity enlightenment inspiration discovery genius thought awaken vision shower archimedes brain mind truth breakthrough'),
  P('oblivion', 5, [], 'Ideas',
    'The state of being forgotten or of being completely unaware.',
    'Where things go when no one remembers them.',
    ['Even empires end up here eventually.', 'A river in the underworld could send you there.', 'The state of being completely forgotten.'],
    'forgotten nothingness void forget unconscious erased darkness lethe',
    'memory nothing death black empty abyss dark vanish gone sleep lost amnesia silence eternity history fade'),
  P('hubris', 5, [], 'Feelings',
    'Excessive pride or self-confidence, often leading to downfall.',
    'A flaw that looks a lot like confidence.',
    ['It always comes right before the fall.', 'Icarus had it and flew too close to the sun.', 'Excessive, overconfident pride.'],
    'pride arrogance ego icarus overconfidence nemesis vanity downfall',
    'greek tragedy hero flaw fall sun confidence boast conceit smug superior myth king punishment god wax'),
  P('limbo', 5, [], 'Ideas',
    'An uncertain state of waiting; also a dance under a lowering bar.',
    'A place between places.',
    ['You’re not here, and you’re not there either.', 'It’s also a party dance with a bar that keeps dropping.', 'A state of uncertain waiting, stuck in between.'],
    'uncertainty waiting between purgatory stuck pending suspended dance',
    'bar pole party heaven hell afterlife wait unknown undecided nowhere pause souls caribbean bend low hanging'),
  P('melancholy', 5, ['melancholia'], 'Feelings',
    'A deep, pensive and long-lasting sadness.',
    'A mood, heavy and quiet.',
    ['It’s sadness that has settled in to stay a while.', 'Medieval doctors blamed it on black bile.', 'A deep, thoughtful sadness.'],
    'sadness gloom sorrow blue mournful pensive despair wistful',
    'sad grey rain dark tears poetry autumn lonely mood depression quiet blues brooding heavy longing tragic'),
  P('zeitgeist', 5, [], 'Ideas',
    'The defining spirit or mood of a particular period of history.',
    'Something every era has, and nobody can hold.',
    ['Every decade has one, and it’s hard to name while you’re in it.', 'It’s German for “time spirit.”', 'The defining mood of an era.'],
    'era spirit culture trend mood generation age german',
    'fashion society period decade history moment collective popular current vibe ideas modern change times attitude'),
  P('catharsis', 5, [], 'Feelings',
    'The release of strong or repressed emotions, bringing relief.',
    'A release that leaves you lighter.',
    ['You feel lighter after a good one.', 'Aristotle said tragedy exists to provide it.', 'The relief of releasing pent-up emotion.'],
    'release relief purge cleansing emotion tragedy aristotle cry',
    'tears feelings therapy scream healing greek theater drama sob rage letting free vent purification outlet'),
  P('ephemeral', 5, [], 'Ideas',
    'Lasting for a very short time.',
    'Something here, then gone.',
    ['Soap bubbles, mayflies and snowflakes all share it.', 'It comes from the Greek for “lasting a day.”', 'Short-lived; fleeting.'],
    'fleeting temporary brief transient momentary passing short fading',
    'bubble mayfly snowflake moment dream flower sunset quick vanish time instant disappear smoke dew mortal'),
  P('solitude', 5, [], 'Feelings',
    'The state of being alone, often peacefully or by choice.',
    'Company of one.',
    ['Some seek it, others fear it.', 'Thoreau went to the woods for it.', 'The peaceful state of being alone.'],
    'alone isolation lonely hermit quiet privacy seclusion retreat',
    'silence peace cabin woods monk island single introvert empty calm meditation thoreau desert wilderness reflection'),
  P('doppelganger', 5, ['doppelgangers', 'doppelgänger'], 'Myth',
    'An apparition or exact double of a living person.',
    'Someone who looks a lot like someone.',
    ['Meeting yours was once considered an omen of death.', 'It’s German for “double-walker.”', 'A person’s exact look-alike.'],
    'double twin lookalike clone copy ghost mirror identical',
    'same face stranger spooky omen german shadow impostor fake evil replica uncanny image swap mystery'),
  P('procrastination', 5, [], 'Ideas',
    'The act of delaying or postponing something that needs doing.',
    'Something you’ll get to later.',
    ['Tomorrow is its favorite day.', 'Deadlines are the only cure that ever works.', 'Putting things off until later.'],
    'delay postpone later lazy deadline tomorrow avoidance stalling',
    'work homework distraction phone waiting habit stress time sloth task busy guilt someday excuse idle'),
  P('wanderlust', 5, [], 'Feelings',
    'A strong desire to travel and explore the world.',
    'An itch you can only scratch with a ticket.',
    ['It makes a perfectly good home feel too small.', 'It’s German for the pleasure of roaming.', 'A deep urge to travel.'],
    'travel explore adventure journey roam nomad backpacking itch',
    'world passport map trip road abroad desire restless freedom flight horizon vagabond tourist suitcase discovery'),
  P('irony', 5, ['ironies'], 'Ideas',
    'Saying the opposite of what you mean, or an outcome opposite to what was expected.',
    'When what happens is the opposite of what you’d expect.',
    ['A fire station burning down is full of it.', 'Sarcasm is its sharper cousin.', 'When the outcome is the opposite of what was expected.'],
    'sarcasm opposite paradox satire unexpected twist dramatic contradiction',
    'humor funny joke literature tragedy fate surprise wit mock coincidence situation reverse tone deadpan dry'),
  P('renaissance', 5, [], 'History',
    'A revival or rebirth, especially of art and learning in Europe from the 14th to 17th centuries.',
    'A rebirth after a long sleep.',
    ['Something old woke up and everything changed.', 'Florence was its cradle.', 'The rebirth of art and learning in Europe.'],
    'rebirth revival art florence leonardo michelangelo italy humanism',
    'europe painting sculpture history culture medici science classical golden age awakening painter vinci raphael enlightenment'),
];

/**
 * Generated bank (scripts/build-puzzles.ts): ~2,900 WordNet puzzles with
 * clues, Dead Air hints and Signal Maps, ranked by depth.
 */
function loadGenerated(): Puzzle[] {
  const file = new URL('./data/puzzles.generated.json', import.meta.url);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8')) as Puzzle[];
}

export const GENERATED: Puzzle[] = loadGenerated();

/** Everything the game can deal from: hand-written picks plus the generated bank. */
export const ALL_PUZZLES: Puzzle[] = [...PUZZLES, ...GENERATED];

/**
 * Words dealt recently across every room. Rooms avoid these when they can, so
 * the whole bank rotates instead of the same favourites coming back.
 */
const RECENT_LIMIT = 800;
const recent: string[] = [];
const recentSet = new Set<string>();
function markDealt(ids: string[]): void {
  for (const id of ids) {
    if (recentSet.has(id)) continue;
    recent.push(id);
    recentSet.add(id);
    if (recent.length > RECENT_LIMIT) recentSet.delete(recent.shift()!);
  }
}

/** Depth for each round: one step deeper every round or two, then The Abyss. */
export const DEPTH_LADDER: Depth[] = [1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Builds the match's descent: one puzzle per round following DEPTH_LADDER,
 * never repeating, preferring puzzles this room hasn't seen. If a depth runs
 * dry it takes the nearest deeper depth first, then shallower.
 */
export function pickPuzzles(rounds: number, avoid: Set<string>, bank: Puzzle[] = ALL_PUZZLES): Puzzle[] {
  const pools = new Map<Depth, Puzzle[]>();
  for (const d of [1, 2, 3, 4, 5] as Depth[]) {
    const at = bank.filter((p) => p.depth === d);
    // Fresh first, then recently dealt elsewhere, then seen in this room.
    const fresh = at.filter((p) => !avoid.has(p.id) && !recentSet.has(p.id));
    const stale = at.filter((p) => !avoid.has(p.id) && recentSet.has(p.id));
    const seen = at.filter((p) => avoid.has(p.id));
    pools.set(d, [...shuffle(fresh), ...shuffle(stale), ...shuffle(seen)]);
  }
  const picked: Puzzle[] = [];
  const n = Math.min(rounds, bank.length);
  for (let i = 0; i < n; i++) {
    const want = DEPTH_LADDER[Math.min(i, DEPTH_LADDER.length - 1)];
    const order = [want, ...[1, 2, 3, 4].flatMap((k) => [want + k, want - k])].filter((d) => d >= 1 && d <= 5) as Depth[];
    const depth = order.find((d) => pools.get(d)!.length > 0);
    if (!depth) break;
    picked.push(pools.get(depth)!.shift()!);
  }
  markDealt(picked.map((p) => p.id));
  return picked;
}
