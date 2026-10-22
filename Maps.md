# Map Learn 

The next feature I want to add is a new game mode where you place countries on SVG maps. We will start with a full, blank map and then assign the player a random country in that map, and they must click/tap within its area (the correct country) to check it off, at which point it becomes "filled in". When they've filled in every country in the map, we show a success screen and a right and wrong count, which is the number of mistakes they made, not the number of countries they got wrong at least once. So if a player clicks 3 countries incorrectly before getting it right, that counts as 3 wrong. Additionally, we will include a "reveal" button that zooms/scrolls to that country and fills it in if the user needs to give up. 

## UI

The UI should follow the existing UI for this game site. However, all maps should be embedded in a zoomable section that takes up all but the top of the screen, which is left for a navbar in desktop and just the name of the current country on mobile. Mobile will also have hamburger menu that serves as the navbar. We want to provide as high fidelity maps as possible, and the zoom to accompany it. On mobile, we can rely purely on pinching for zoom and single-finger dragging for movement. It would be ideal if a single tap can be select&confirm, but if that results in too many misclicks, then we'll need to have single tap be for selecting and the second tap for confirm as a guess. Lets stick with single=tap for both for now. 

When land regions are what's being guessed, they should start as a light tan, and when correctly guessed, should become a grassy green. Lets stick with matte-pastel colors for now, and all-black borders. The oceans should be a light, sea blue. However, in ocean maps, when the oceans are checked, they should become a dark ocean blue, and land should be a muted version of the tan color. 

The map needs to take up as much of the screen as possible with no side, top bottom borders on mobile and desktop. There should be a dark gray pill with a white name for the region the user is currently supposed to guess and a N/T fraction similar to geolearn which shows how many countries the user has checked out of the total, and a gray hamburger menu in the top right corner. both should hover over the map. Clicking on the pill triggers a reveal, revealing and checking the current country. 

In both mobile and desktop, a small rectangular flash message should pop up with "Correct" or "Incorrect" after every guess, before disappearing after 2 seconds (or being replaced by the next guess). The rectangle, its border and fill and text color should be green for correct and red for incorrect. 

When a map is complete, we should should a modal on top of the map with "Congratulations" and then the 3 stats - Correct (with a green checkmark emoji), Incorrect (with a red x emoji), Reveals (with a white flag emoji) - and a "Home" and "Retry" button at the bottom. 

## Maps

The world map and the six continent maps (North America, South America, Europe, Africa, Asia, and Oceania) are implemented. The remaining entries below are future ideas. Continent maps reuse the world geometry with bounded panning and no wrapping. Europe cuts Russia approximately at the Urals; Asia includes all of Russia. Oceania extends from Indonesia through French Polynesia and Pitcairn, excluding Hawaii, Taiwan, Christmas Island, and Cocos (Keeling).

Region Maps:
- World
- North America
- South America
- Europe
- Africa
- Asia
- Oceania
- Middle East
- US States
- French departments (implemented: 101 departments, including five unlabeled overseas insets)
- Indian States (implemented: 28 states and 8 union territories, with dashed targets for small regions)
- NYC Neighborhoods. Just Manhattan, Brooklyn, Queens
- London Neighborhoods. 

Microregion Maps (All will be microregions on top of existing SVG maps, which should have country or state borders):
- Massachusetts Towns (implemented: 64 cities and towns with dashed circles, including Milton, Braintree, Norfolk, Wellesley, Lexington, Concord, and Hull)
- US Cities (top 50), uses the US States map.
- World Capitals uses the World map
- European Cities. Uses the Europe map.
- Microstates (just the microstates)

Water Maps:
- European Rivers (implemented in Other: 31 major rivers, Ireland to western Russia; no Iceland. National borders provide context, and blue river paths are the selectable targets. Volga is shown only in part.)
- World Oceans & Seas
    - Atlantic Ocean
    - Pacific Ocean
    - Indian Ocean
    - Arctic Ocean
    - Arabian Sea
    - Bay of Bengal
    - Red Sea
    - Caspian Sea
    - Black Sea
    - North Sea
    - English Channel
    - Baltic Sea
    - Adriatic Sea
    - Ionian Sea
    - Persian Gulf
    - South China Sea
    - Sea of Azov
    - Gulf of Mexico
    - Bering Sea/Straight
    - Gulf in Kamchatka?
    - Korean Gulf? 
    - Yellow Sea?
    - Straight of Hormuz
    - Straight of Magellan
    - Singapore Straight?
    - Straight of Gibraltar
    - Suez Canal
    - Panama Canal
    - Hudson Bay
    - St James Bay

Future Ideas: 
- Holy Roman Empire
- British cities
- Irish counties
- Roman provinces
- Native American Tribes
- Renaissance Italian Cities
- Holy Land cities

For each map, we will need to fetch or build a high fidelity, zoomable, clickable SVG map. They must have neat, non-doubled, shared borders that fit together perfectl, even when one is hovered. When hovering on a given state, it should increase in brightness.

For some regions that are relatively tiny compared to their neigbhors, we will need to create an artificial area around the region that allows users to click it more easily. I think this is best represented as a circle with a dashed line and a slight opacity to differentiate it. For land maps (all but the world oceans/seas)

Exactly like we have a filter for microstates in GeoLean (the existing game), we will in this game. We should use the same canonical list for that one. It should be an option to toggle, defaulting to true, for all relevant maps (Europe, North America, South America, Africa, Asia, Oceania, World). When microstates are disabled, they shouldn't have their area visible on the map nor count against the total. Like in GeoLean, small but real, sovereign countries like the Vatican, monaco, singapore, etc. are not microstates.

## Home Page

The Home Page is simply a title "Maps" with a list of buttons with icons for each of the map options we offer. We should categorize them with headers the way i've done above. I want an icon ,maybe just a zoomed out version of the map, as a thumbnail on the left and then the name of the map on the right, where the entire thing, not just the text, is clickable. On click, it just takes you to that map page and you start playing. Maybe we offer a modal for maps that have microstates with a simple question: "include microstates?" and a yes (green on right) and no (red, on left) button. At the bottom of the list of maps should be a link to GeoLearn saying "More geography trivia at GeoLearn" (link to gquiz.pirategames.org), Maybe just make it another option in the same style as maps. It should open in a new tab. 

The world map established the interaction and visual structure; the six continent maps now use that same structure and are playable from the home menu.
It is imperative that the clicking lines up with the SVG shapes and location at all zoom and scroll values. 
