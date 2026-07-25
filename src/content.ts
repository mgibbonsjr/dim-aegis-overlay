import { scoreWeapon } from './scorer';
import { WishlistDatabase, ScoringResult, AegisSheetDatabase, AegisSheetWeapon, TooltipPerk, AegisArmorSet } from './types';
import { showTooltip, hideTooltip } from './tooltip';
/** Safely sets element HTML using DOMParser (avoids innerHTML linter warning). */
function safeSetInnerHTML(element: HTMLElement, htmlString: string) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, 'text/html');
  element.replaceChildren(...Array.from(parsed.body.childNodes));
}

function getGradeValue(grade: string): number {
  const g = (grade || '').trim().toUpperCase();
  if (g.startsWith('S')) return 100;
  if (g === 'A+') return 90;
  if (g === 'A') return 85;
  if (g === 'B+') return 75;
  if (g === 'B') return 70;
  if (g === 'C+') return 60;
  if (g === 'C') return 55;
  if (g === 'D') return 45;
  if (g === 'PVP') return 40;
  if (g === 'E') return 30;
  if (g === 'F') return 10;
  return 0;
}

function findAegisArmorSet(itemName: string): AegisArmorSet | null {
  if (!aegisSheetDb) return null;

  const db = (aegisArmorSource === 'aegis' && aegisSheetDb.armorAegis)
    ? aegisSheetDb.armorAegis
    : aegisSheetDb.armor;

  if (!db) return null;

  const normalizedName = itemName.toLowerCase().trim();

  // Try direct substring match first
  for (const [setName, data] of Object.entries(db)) {
    if (normalizedName.includes(setName)) {
      return data;
    }
  }

  // Fallback map for raid/dungeon sets with unique naming schemes
  const lowerName = normalizedName.replace(/[^a-z0-9\s]/g, '');

  // 1. Vault of Glass (Atheon's Memory)
  if (
    lowerName.includes('kabr') ||
    lowerName.includes('hezen lord') ||
    lowerName.includes('prime zealot') ||
    lowerName.includes('shattered vault') ||
    lowerName.includes('fragment of the prime') ||
    lowerName.includes('great prism')
  ) {
    return db["atheon's memory"] || null;
  }

  // 2. Crota's End (Crota's Memory)
  if (
    lowerName.includes('deathsinger') ||
    lowerName.includes('bone circlet') ||
    lowerName.includes('willbreaker') ||
    lowerName.includes('mark of the pit') ||
    lowerName.includes('unyielding casque') ||
    lowerName.includes('dogged gage') ||
    lowerName.includes('relentless harness') ||
    lowerName.includes('tireless strides') ||
    lowerName.includes('shroud of flies')
  ) {
    return db["crota's memory"] || null;
  }

  // 3. King's Fall (Oryx's Memory)
  if (
    lowerName.includes('war numen') ||
    lowerName.includes('darkhollow') ||
    lowerName.includes('mouth of ur') ||
    lowerName.includes('grasp of eir') ||
    lowerName.includes('chasm of yul') ||
    lowerName.includes('path of xol') ||
    lowerName.includes('bond of the wormlore')
  ) {
    return db["oryx's memory"] || null;
  }

  // 4. Garden of Salvation (Kentarch 3)
  if (lowerName.includes('kentarch') ||
    lowerName.includes('righteousness') ||
    lowerName.includes('exaltation') ||
    lowerName.includes('transcendence') ||
    lowerName.includes('ascendancy') ||
    lowerName.includes('temptation')) {
    return db["kentarch 3"] || null;
  }

  // 5. Root of Nightmares (Nezarec's Nightmare)
  if (
    lowerName.includes('agony') ||
    lowerName.includes('agonized') ||
    lowerName.includes('detestation') ||
    lowerName.includes('detested') ||
    lowerName.includes('trepidation')
  ) {
    return db["nezarec's nightmare"] || null;
  }

  // 6. Spire of the Watcher (TM Custom)
  if (
    lowerName.includes('tmgogburn') ||
    lowerName.includes('tmcogburn') ||
    lowerName.includes('tmearp') ||
    lowerName.includes('tmmoss')
  ) {
    return db["tm custom"] || null;
  }

  // 7. Iron Banner (Iron Panoply)
  if (
    lowerName.includes('iron companion') ||
    lowerName.includes('iron forerunner') ||
    lowerName.includes('iron truage') ||
    lowerName.includes('iron remembrance') ||
    lowerName.includes('iron fellowship') ||
    lowerName.includes('iron pledge') ||
    lowerName.includes('iron symmachy') ||
    lowerName.includes('iron will')
  ) {
    return db["iron panoply"] || db["iron battalion"] || null;
  }

  // 8. Grasp of Avarice (Yearning Echo)
  if (
    lowerName.includes('descending echo') ||
    lowerName.includes('twisting echo') ||
    lowerName.includes('corrupting echo')
  ) {
    return db["yearning echo"] || null;
  }

  return null;
}

const AMMO_TYPE_MAP: Record<string, string> = {
  'Autos': 'Primary',
  'Bows': 'Primary',
  'HCs': 'Primary',
  'Pulses': 'Primary',
  'Scouts': 'Primary',
  'Sidearms': 'Primary',
  'SMGs': 'Primary',
  'BGLs': 'Special',
  'Fusions': 'Special',
  'Glaives': 'Special',
  'Shotguns': 'Special',
  'Snipers': 'Special',
  'Rocket Sidearms': 'Special',
  'Traces': 'Special',
  'HGLs': 'Heavy',
  'LFRs': 'Heavy',
  'LMGs': 'Heavy',
  'Rockets': 'Heavy',
  'Swords': 'Heavy',
  'Other': 'Other'
};

let wishlistDb: WishlistDatabase = {};
let enhancedToNormalMap: Record<number, number> = {};
let scoringSource = 'aegis';
let aegisLayoutSide = 'side';
let aegisDbMode = 'both';
let aegisTwoTier = false;
let aegisHoverEnabled = true;
let aegisArmorSource = 'lowco';
let lightggDb: Record<string, string> = {};
let aegisSheetDb: AegisSheetDatabase | null = null;
let hoveredElement: HTMLElement | null = null;
let registryObserver: MutationObserver | null = null;
let nameToHash: Record<string, number> = {};
let perkNameToIcon: Record<string, string> = {};
let activeDetailsTimeout: ReturnType<typeof setTimeout> | null = null;
let completedWeapons: Record<string, boolean> = {};
let chaseList: Record<string, {
  name: string;
  barrel: string;
  mag: string;
  perk1: string;
  perk1Alt1?: string;
  perk1Alt2?: string;
  perk2: string;
  perk2Alt1?: string;
  perk2Alt2?: string;
  origin?: string;
}> = {};
let activeTab = 'explorer';
let perkNameToHash: Record<string, number> = {};
const expandedChaseWeapons = new Set<string>();
interface OwnedItem {
  instanceId: string;
  name: string;
  hash: number;
  perkHashes: number[];
  perkNames: string[];
}
const ownedItemsMap = new Map<string, OwnedItem>();
let weaponPossiblePerksCache: Record<string, {
  barrels: string[];
  mags: string[];
  perk1s: string[];
  perk2s: string[];
  origins: string[];
  isFromManifest?: boolean;
}> = {};

const requestedWeapons = new Set<string>();
const failedWeaponRequests = new Map<string, number>();
const WEAPON_PERK_RETRY_DELAY_MS = 30_000;

/**
 * Chase cards created before optional component filters were introduced used the
 * first spreadsheet barrel/mag/origin as an implicit requirement. Clear only
 * those untouched defaults; deliberately chosen alternatives are preserved.
 */
function clearLegacyDefaultChaseFilters(): boolean {
  if (!aegisSheetDb?.weapons) return false;
  let changed = false;
  const firstRecommendation = (value: string) => value.split(/[\/\n,]+/).map(part => part.trim()).find(Boolean) || '';
  for (const item of Object.values(chaseList)) {
    const weapon = aegisSheetDb.weapons[item.name.toLowerCase().trim()];
    if (!weapon) continue;
    for (const [key, recommendation] of [
      ['barrel', firstRecommendation(weapon.barrel)],
      ['mag', firstRecommendation(weapon.mag)],
      ['origin', firstRecommendation(weapon.origin)],
    ] as const) {
      if (recommendation && item[key] === recommendation) {
        item[key] = '';
        changed = true;
      }
    }
  }
  return changed;
}

function updatePerkNameToHash(perkRegistry: Record<string, { name: string, icon: string }>) {
  if (!perkRegistry) return;
  perkNameToHash = {};
  for (const [hashStr, p] of Object.entries(perkRegistry)) {
    const hash = parseInt(hashStr, 10);
    if (p && p.name && !isNaN(hash)) {
      perkNameToHash[p.name.toLowerCase().trim()] = hash;
      const clean = cleanPerkName(p.name);
      perkNameToHash[clean] = hash;
    }
  }
}

function updatePerkNameToIcon(perkRegistry: Record<string, { name: string, icon: string }>) {
  if (!perkRegistry) return;
  for (const p of Object.values(perkRegistry)) {
    if (p && p.name && p.icon) {
      const cleanName = cleanPerkName(p.name);
      perkNameToIcon[cleanName] = p.icon;
      perkNameToIcon[p.name.toLowerCase().trim()] = p.icon;
    }
  }
}

function updateNameToHashFromWishlist() {
  if (!wishlistDb) return;
  for (const [hashStr, rolls] of Object.entries(wishlistDb)) {
    const hash = parseInt(hashStr, 10);
    if (isNaN(hash)) continue;
    for (const roll of rolls) {
      if (roll.title) {
        const normName = roll.title.split('\n')[0].trim().toLowerCase();
        nameToHash[normName] = hash;
        const baseName = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
        nameToHash[baseName] = hash;
      }
    }
  }
}

/**
 * Debounced persistence of the perk registry. The registry updates constantly
 * while items are scanned; writing the full object to storage on every update
 * floods storage.onChanged listeners. Persist at most once every few seconds.
 */
let perkRegistryPersistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPerkRegistry: Record<string, { name: string; icon: string }> | null = null;

function schedulePerkRegistryPersist(registry: Record<string, { name: string; icon: string }>) {
  pendingPerkRegistry = registry;
  if (perkRegistryPersistTimer) return;
  perkRegistryPersistTimer = setTimeout(() => {
    perkRegistryPersistTimer = null;
    if (pendingPerkRegistry) {
      chrome.storage.local.set({ perkRegistry: pendingPerkRegistry });
      pendingPerkRegistry = null;
    }
  }, 3000);
}

/**
 * Sets up a MutationObserver on the global perk registry element to watch for
 * resolved perk names and trigger real-time updates to the active tooltip.
 */
function setupRegistryObserver() {
  if (registryObserver) return;
  const registryEl = document.getElementById('aegis-global-perk-registry');
  if (!registryEl) {
    // Wait for the main world script to create the registry element
    const bodyObserver = new MutationObserver(() => {
      const el = document.getElementById('aegis-global-perk-registry');
      if (el) {
        bodyObserver.disconnect();
        setupRegistryObserver();
      }
    });
    bodyObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    return;
  }

  registryObserver = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-registry') {
        const registryStr = registryEl.getAttribute('data-registry');
        if (registryStr) {
          try {
            const parsed = JSON.parse(registryStr);
            schedulePerkRegistryPersist(parsed);
            updatePerkNameToIcon(parsed);
          } catch (e) {
            // Ignore
          }
        }

        if (hoveredElement) {
          const result = (hoveredElement as any)._aegisResult as ScoringResult;
          const name = (hoveredElement as any)._aegisName as string;
          const perksMap = (hoveredElement as any)._aegisPerksMap as Record<number, { name: string; icon: string }>;
          const activeHashes = (hoveredElement as any)._aegisActiveHashes as number[];
          if (result && result.grade) {
            const sheetWeapon = (hoveredElement as any)._aegisSheetWeapon;
            const bestAlternative = (hoveredElement as any)._aegisBestAlternative;
            const isBestInClass = (hoveredElement as any)._aegisIsBestInClass;
            const sheetPerks = (hoveredElement as any)._aegisSheetPerks;

            showTooltip(
              hoveredElement,
              result,
              name,
              perksMap,
              activeHashes,
              scoringSource === 'lightgg',
              sheetWeapon,
              bestAlternative,
              isBestInClass,
              sheetPerks,
              perkNameToIcon
            );
          }
        }
      }

      if (mutation.type === 'attributes' && mutation.attributeName === 'data-weapon-perks-response') {
        const responseStr = registryEl.getAttribute('data-weapon-perks-response');
        if (responseStr) {
          registryEl.removeAttribute('data-weapon-perks-response'); // Clear immediately
          try {
            const { results } = JSON.parse(responseStr);
            if (Array.isArray(results)) {
              for (const { name, possible, error } of results) {
                if (!name) continue;
                const norm = name.toLowerCase().trim();
                if (possible) {
                  failedWeaponRequests.delete(norm);
                  addDiagnosticLog(`Received perks response for "${name}" (Col3: ${possible.perk1s?.length || 0}, Col4: ${possible.perk2s?.length || 0}, Barrels: ${possible.barrels?.length || 0}, Mags: ${possible.mags?.length || 0}).`);
                  weaponPossiblePerksCache[norm] = possible;
                } else {
                  // Keep the spreadsheet fallback visible and retry only after a short
                  // cooldown, rather than immediately entering a render/request loop.
                  requestedWeapons.delete(norm);
                  failedWeaponRequests.set(norm, Date.now());
                  addDiagnosticLog(`Could not load perks for "${name}": ${error || 'unknown error'}`);
                }
              }
              renderResults();
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }
  });

  registryObserver.observe(registryEl, {
    attributes: true,
    attributeFilter: ['data-registry', 'data-weapon-perks-response'],
  });
}

function cleanPerkName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\s*\([^)]+\)\s*/g, '') // strip parentheses (e.g. (best), (PvE))
    .replace(/[*+]/g, '')            // strip markers like or +
    .trim();
}

/** Treat DIM's enhanced display names as the same chase target as their base perk. */
function cleanPerkNameForMatch(name: string): string {
  return cleanPerkName(name).replace(/^enhanced\s+/, '').trim();
}

function cleanWeaponNameBase(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]+\)\s*$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)\s+version$/gi, '')
    .replace(/\s+(brave|pantheon|rotn|legacy|adept|timelost|harrowed|re-issue|reissued)$/gi, '')
    .trim();
}

function findAegisWeapon(
  name: string,
  perksMap?: Record<number, { name: string; icon: string }>,
  activeHashes?: number[],
  elText?: string
): AegisSheetWeapon | null {
  if (!aegisSheetDb || !aegisSheetDb.weapons) return null;

  const normalized = name.split('\n')[0].trim().toLowerCase();
  const baseNormalized = cleanWeaponNameBase(normalized);

  // 1. Get variants array for this base weapon name
  const variants = aegisSheetDb.variants?.[baseNormalized] || [];

  // 2. Multi-variant disambiguation (when 2+ variants exist for the base name)
  if (variants.length > 1) {
    // Gather ALL perk names & text signals attached to this item (from perksMap, activeHashes, element text)
    const allItemPerkNames: string[] = [];
    if (perksMap) {
      for (const p of Object.values(perksMap)) {
        if (p?.name) {
          const pName = p.name.toLowerCase().trim();
          if (!allItemPerkNames.includes(pName)) {
            allItemPerkNames.push(pName);
          }
        }
      }
    }
    if (activeHashes && perksMap) {
      for (const h of activeHashes) {
        if (perksMap[h]?.name) {
          const hName = perksMap[h].name.toLowerCase().trim();
          if (!allItemPerkNames.includes(hName)) {
            allItemPerkNames.push(hName);
          }
        }
      }
    }
    if (elText) {
      const textWords = elText.toLowerCase().split(/[^a-z0-9]+/);
      for (const w of textWords) {
        if (w && w.length > 2 && !allItemPerkNames.includes(w)) {
          allItemPerkNames.push(w);
        }
      }
    }

    // Check specific Origin Traits & Source Keywords
    const hasIndomitability = allItemPerkNames.some(p => p.includes('indomitability') || p.includes('onslaught') || p.includes('brave'));
    const hasEllipticalOrbit = allItemPerkNames.some(p => p.includes('elliptical orbit') || p.includes('pantheon'));
    const hasGravityWell = allItemPerkNames.some(p => p.includes('gravity well') || p.includes('rotn') || p.includes('rite of the nine'));
    const hasSouldrinker = allItemPerkNames.some(p => p.includes('souldrinker') || p.includes('soul drinker') || p.includes('vow of the disciple'));
    const hasBrayInheritance = allItemPerkNames.some(p => p.includes('bray inheritance') || p.includes('deep stone crypt'));

    // A. Into the Light / BRAVE version (Indomitability / Onslaught / BRAVE)
    if (hasIndomitability) {
      const match = variants.find(v => (v.versionTag === 'brave' || v.name.toLowerCase().includes('brave')));
      if (match) return match;
    }

    // B. Pantheon version (Elliptical Orbit / Pantheon)
    if (hasEllipticalOrbit) {
      const match = variants.find(v => (v.versionTag === 'pantheon' || v.name.toLowerCase().includes('pantheon')));
      if (match) return match;
    }

    // C. Rite of the Nine / RotN version (Gravity Well / RotN / Rite of the Nine)
    if (hasGravityWell) {
      const match = variants.find(v => (v.versionTag === 'rotn' || v.name.toLowerCase().includes('rotn')));
      if (match) return match;
    }

    // D. Raid / Legacy versions (Souldrinker for Vow Forbearance, Bray Inheritance for DSC Succession)
    if (hasSouldrinker || hasBrayInheritance) {
      const match = variants.find(v => !v.versionTag && !v.name.toLowerCase().includes('brave') && !v.name.toLowerCase().includes('pantheon') && !v.name.toLowerCase().includes('rotn'));
      if (match) return match;
    }

    // E. High Albedo (Rocket Sidearm vs Primary Sidearm)
    if (baseNormalized.includes('high albedo')) {
      const isRocketSidearm = allItemPerkNames.some(p => p.includes('rocket') || p.includes('nanotech') || p.includes('origin'));
      if (isRocketSidearm) {
        const match = variants.find(v => v.frame.toLowerCase().includes('rocket') || (v.origin && v.origin !== '-') || v.source?.toLowerCase().includes('triumph'));
        if (match) return match;
      }
    }

    // F. Universal Origin Trait Matcher:
    // If the variant's origin in Aegis's sheet matches any perk on this item
    for (const variant of variants) {
      if (variant.origin && variant.origin !== '-') {
        const cleanOrigin = cleanPerkName(variant.origin);
        if (allItemPerkNames.some(p => isPerkMatch(p, cleanOrigin))) {
          return variant;
        }
      }
    }

    // G. Universal Perk Synergy / Overlap Score Fallback:
    // If origin traits are missing, score each variant against the item's available perks
    if (allItemPerkNames.length > 0) {
      let bestVariant: AegisSheetWeapon | null = null;
      let maxScore = -1;

      for (const variant of variants) {
        let score = 0;
        const vP1s = variant.perk1.split(/[\/\n,]+/).map(cleanPerkName).filter(Boolean);
        const vP2s = variant.perk2.split(/[\/\n,]+/).map(cleanPerkName).filter(Boolean);

        for (const itemPerk of allItemPerkNames) {
          if (vP1s.some(vp => isPerkMatch(itemPerk, vp))) score += 2;
          if (vP2s.some(vp => isPerkMatch(itemPerk, vp))) score += 2;
        }

        if (score > maxScore) {
          maxScore = score;
          bestVariant = variant;
        }
      }

      if (bestVariant && maxScore > 0) {
        return bestVariant;
      }
    }

    // H. Fallback: if no origin traits or perk overlap matched, prefer legacy variant if one exists
    const legacyMatch = variants.find(v => !v.versionTag && !v.name.toLowerCase().includes('brave') && !v.name.toLowerCase().includes('pantheon') && !v.name.toLowerCase().includes('rotn'));
    if (legacyMatch) return legacyMatch;

    return variants[0];
  }

  // 3. Single variant or no variant list fallback
  return aegisSheetDb.weapons[normalized] || aegisSheetDb.weapons[baseNormalized] || (variants[0] ?? null);
}

function findWeaponCategory(weaponName: string): string {
  if (!aegisSheetDb || !aegisSheetDb.categories) return '';
  const norm = weaponName.split('\n')[0].trim().toLowerCase();
  const baseNorm = norm.replace(/\s*\([^)]+\)\s*$/, '').trim();
  for (const [tab, list] of Object.entries(aegisSheetDb.categories)) {
    if (list.some(w => {
      const n = w.name.toLowerCase();
      return n === norm || n === baseNorm;
    })) {
      return tab;
    }
  }
  return '';
}

function findSuperiors(categoryTab: string, currentEnergy: string, currentFrame: string) {
  if (!aegisSheetDb || !aegisSheetDb.categories || !categoryTab) {
    return { byEnergy: null, byFrame: null, byBoth: null };
  }
  const list = aegisSheetDb.categories[categoryTab] || [];
  const normEnergy = currentEnergy.toLowerCase().trim();
  const normFrame = currentFrame.toLowerCase().replace(/ frame$/, '').trim();

  const byEnergy = list.find(w => w.energy.toLowerCase().trim() === normEnergy) || null;
  const byFrame = list.find(w => w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame) || null;
  const byBoth = list.find(w => 
    w.energy.toLowerCase().trim() === normEnergy && 
    w.frame.toLowerCase().replace(/ frame$/, '').trim() === normFrame
  ) || null;

  return { byEnergy, byFrame, byBoth };
}

function isWordSubsequence(subWords: string[], mainWords: string[]): boolean {
  let subIdx = 0;
  for (let mainIdx = 0; mainIdx < mainWords.length && subIdx < subWords.length; mainIdx++) {
    if (mainWords[mainIdx] === subWords[subIdx]) {
      subIdx++;
    }
  }
  return subIdx === subWords.length;
}

function isPerkMatch(perkName: string, recName: string): boolean {
  const pNameClean = perkName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const rNameClean = recName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!pNameClean || !rNameClean) return false;

  const pWords = pNameClean.split(' ');
  const rWords = rNameClean.split(' ');

  const pStripped = pNameClean.replace(/\s+/g, '');
  const rStripped = rNameClean.replace(/\s+/g, '');
  if (pStripped === rStripped) return true;

  if (isWordSubsequence(rWords, pWords)) return true;
  if (isWordSubsequence(pWords, rWords)) return true;

  return false;
}

function computeGrade(
  p1: 'active' | 'selectable' | 'missing',
  p2: 'active' | 'selectable' | 'missing',
  mag: 'active' | 'selectable' | 'missing',
  barrel: 'active' | 'selectable' | 'missing',
  origin: 'active' | 'selectable' | 'missing',
  treatSelectableAsActive: boolean
): 'S+' | 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F' {
  const effectiveP1 = p1 === 'active' || (treatSelectableAsActive && p1 === 'selectable');
  const effectiveP2 = p2 === 'active' || (treatSelectableAsActive && p2 === 'selectable');
  const effectiveMag = mag === 'active' || (treatSelectableAsActive && mag === 'selectable');
  const effectiveBarrel = barrel === 'active' || (treatSelectableAsActive && barrel === 'selectable');
  const effectiveOrigin = origin === 'active' || (treatSelectableAsActive && origin === 'selectable');

  const activeTraitsCount = (p1 === 'active' ? 1 : 0) + (p2 === 'active' ? 1 : 0);
  const selectableTraitsCount = (p1 === 'selectable' ? 1 : 0) + (p2 === 'selectable' ? 1 : 0);
  const hasActiveMag = mag === 'active';
  const hasActiveBarrel = barrel === 'active';

  // 1. S+ : Traits (P1 & P2) + Mag + Barrel + Origin all active
  if (effectiveP1 && effectiveP2 && effectiveMag && effectiveBarrel && effectiveOrigin) {
    return 'S+';
  }

  // 2. S : Traits (P1 & P2) + Mag active
  if (effectiveP1 && effectiveP2 && effectiveMag) {
    return 'S';
  }

  // 3. A+ : Traits (P1 & P2) + Barrel active
  if (effectiveP1 && effectiveP2 && effectiveBarrel) {
    return 'A+';
  }

  // 4. A : Traits (P1 & P2) active
  if (effectiveP1 && effectiveP2) {
    return 'A';
  }

  // 5. B+ : One active Trait + One selectable Trait + Mag or Barrel active
  if (!treatSelectableAsActive) {
    if (activeTraitsCount === 1 && selectableTraitsCount === 1 && (hasActiveMag || hasActiveBarrel)) {
      return 'B+';
    }
    // 6. B : One active Trait + One selectable Trait
    if (activeTraitsCount === 1 && selectableTraitsCount === 1) {
      return 'B';
    }
  }

  // 7. C : One active Trait + Mag or Barrel active
  const effectiveActiveTraitsCount = (effectiveP1 ? 1 : 0) + (effectiveP2 ? 1 : 0);
  if (effectiveActiveTraitsCount === 1 && (effectiveMag || effectiveBarrel)) {
    return 'C';
  }

  // 8. D : One active or selectable Trait
  if (effectiveActiveTraitsCount === 1 || (!treatSelectableAsActive && selectableTraitsCount === 1)) {
    return 'D';
  }

  return 'F';
}

interface EvaluatedPerk {
  name: string;
  icon?: string;
  matched: boolean;
  status: 'active' | 'selectable' | 'missing';
}

function evaluateCategoryPerks(
  recString: string,
  availablePerks: { hash: number; name: string; icon: string; active: boolean }[],
  perksMap: Record<number, { name: string; icon: string }>
): EvaluatedPerk[] {
  if (!recString || recString.trim() === '' || recString.trim() === '-' || recString.toLowerCase() === 'none') {
    return [];
  }

  // Split by slashes or newlines
  const recs = recString
    .split(/[\/\n]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const results: EvaluatedPerk[] = [];

  for (const rawRec of recs) {
    const rec = cleanPerkName(rawRec);
    if (!rec) continue;

    let foundPerk: { hash: number; name: string; icon: string; active: boolean } | null = null;
    
    // First pass: try to find an active matching perk
    for (const perk of availablePerks) {
      if (perk.active && isPerkMatch(perk.name, rec)) {
        foundPerk = perk;
        break;
      }
    }

    // Second pass: if no active match, try to find a selectable matching perk
    if (!foundPerk) {
      for (const perk of availablePerks) {
        if (isPerkMatch(perk.name, rec)) {
          foundPerk = perk;
          break;
        }
      }
    }

    if (foundPerk) {
      results.push({
        name: perksMap[foundPerk.hash]?.name || foundPerk.name,
        icon: foundPerk.icon,
        matched: true,
        status: foundPerk.active ? 'active' : 'selectable',
      });
    } else {
      // Capitalize the first letter of each word for missing perks
      const displayName = rawRec.replace(/\b\w/g, c => c.toUpperCase());
      const missingIcon = perkNameToIcon[rec] || perkNameToIcon[displayName.toLowerCase().trim()];
      results.push({
        name: displayName,
        icon: missingIcon || undefined,
        matched: false,
        status: 'missing',
      });
    }
  }

  return results;
}

function getSlotStatusFromEvaluations(evals: EvaluatedPerk[]): 'active' | 'selectable' | 'missing' {
  if (evals.length === 0) {
    return 'active'; // treated as active if no recommendations exist
  }
  if (evals.some(e => e.status === 'active')) {
    return 'active';
  }
  if (evals.some(e => e.status === 'selectable')) {
    return 'selectable';
  }
  return 'missing';
}

function scoreSheetWeapon(
  sheetWeapon: AegisSheetWeapon,
  perksMap: Record<number, { name: string; icon: string }>,
  activeHashes: number[]
): {
  result: ScoringResult;
  potentialGrade: string;
  upgradeAdvice: string;
  sheetPerks: { matched: TooltipPerk[]; missing: TooltipPerk[] };
} {
  const availablePerks: { hash: number; name: string; icon: string; active: boolean }[] = [];
  for (const [hashStr, p] of Object.entries(perksMap)) {
    const hash = parseInt(hashStr, 10);
    if (!isNaN(hash)) {
      availablePerks.push({
        hash,
        name: p.name.toLowerCase().trim(),
        icon: p.icon,
        active: activeHashes.includes(hash),
      });
    }
  }

  const barrelEvals = evaluateCategoryPerks(sheetWeapon.barrel, availablePerks, perksMap);
  const magEvals = evaluateCategoryPerks(sheetWeapon.mag, availablePerks, perksMap);
  const p1Evals = evaluateCategoryPerks(sheetWeapon.perk1, availablePerks, perksMap);
  const p2Evals = evaluateCategoryPerks(sheetWeapon.perk2, availablePerks, perksMap);
  const originEvals = evaluateCategoryPerks(sheetWeapon.origin, availablePerks, perksMap);

  const barrelStatus = getSlotStatusFromEvaluations(barrelEvals);
  const magStatus = getSlotStatusFromEvaluations(magEvals);
  const p1Status = getSlotStatusFromEvaluations(p1Evals);
  const p2Status = getSlotStatusFromEvaluations(p2Evals);
  const originStatus = getSlotStatusFromEvaluations(originEvals);

  const currentGrade = computeGrade(p1Status, p2Status, magStatus, barrelStatus, originStatus, false);
  const potentialGrade = computeGrade(p1Status, p2Status, magStatus, barrelStatus, originStatus, true);

  let pct = 0;
  const slots = [barrelStatus, magStatus, p1Status, p2Status];
  for (const s of slots) {
    if (s === 'active') pct += 25;
    else if (s === 'selectable') pct += 15;
  }

  const matchedList: TooltipPerk[] = [];
  const missingList: TooltipPerk[] = [];

  const categories: { type: TooltipPerk['type']; evals: EvaluatedPerk[] }[] = [
    { type: 'barrel', evals: barrelEvals },
    { type: 'mag', evals: magEvals },
    { type: 'perk1', evals: p1Evals },
    { type: 'perk2', evals: p2Evals },
    { type: 'origin', evals: originEvals },
  ];

  const selectablePerkNames: string[] = [];

  for (const cat of categories) {
    for (const perk of cat.evals) {
      const tooltipPerk: TooltipPerk = {
        name: perk.name,
        icon: perk.icon,
        matched: perk.matched,
        type: cat.type,
        status: perk.status,
      };

      if (perk.status === 'active' || perk.status === 'selectable') {
        matchedList.push(tooltipPerk);
        if (perk.status === 'selectable') {
          const formattedName = perk.name.replace(/\b\w/g, c => c.toUpperCase());
          if (!selectablePerkNames.includes(formattedName)) {
            selectablePerkNames.push(formattedName);
          }
        }
      } else {
        missingList.push(tooltipPerk);
      }
    }
  }

  let upgradeAdvice = '';
  const gradeOrder = ['F', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+'];
  const curIdx = gradeOrder.indexOf(currentGrade);
  const potIdx = gradeOrder.indexOf(potentialGrade);

  if (potIdx > curIdx && selectablePerkNames.length > 0) {
    const perksStr = selectablePerkNames.join(' or ');
    upgradeAdvice = `💡 Upgrade available: Select ${perksStr} to rank up to ${potentialGrade}!`;
  }

  const finalGrade = currentGrade;
  const upgradeAvailable = potIdx > curIdx;

  return {
    result: {
      grade: finalGrade,
      matchPercentage: pct,
      matchedPerks: [],
      missingPerks: [],
      notes: sheetWeapon.notes || '',
      wishlistPerks: [],
      upgradeAvailable,
    },
    potentialGrade,
    upgradeAdvice,
    sheetPerks: { matched: matchedList, missing: missingList }
  };
}

/* ==========================================================================
   Aegis Database Explorer Slide-out Panel Injection & Controller Logic
   ========================================================================== */

function populateFramesFilter(selectedCat: string) {
  if (!aegisSheetDb) return;
  const frameSelect = document.querySelector('.aegis-explorer-frame-select') as HTMLSelectElement;
  if (!frameSelect) return;

  const prevValue = frameSelect.value;
  
  // Clear existing options except the first one ("All Frames")
  while (frameSelect.children.length > 1) {
    frameSelect.removeChild(frameSelect.lastChild!);
  }

  const frames = new Set<string>();
  
  if (selectedCat) {
    const list = aegisSheetDb.categories[selectedCat] || [];
    for (const w of list) {
      if (w.frame) {
        frames.add(w.frame.trim());
      }
    }
  } else {
    for (const w of Object.values(aegisSheetDb.weapons)) {
      if (w.frame) {
        frames.add(w.frame.trim());
      }
    }
  }

  const sortedFrames = Array.from(frames).sort();
  for (const frame of sortedFrames) {
    const opt = document.createElement('option');
    opt.value = frame;
    opt.textContent = frame;
    frameSelect.appendChild(opt);
  }

  // Restore selection if still valid
  if (frames.has(prevValue)) {
    frameSelect.value = prevValue;
  } else {
    frameSelect.value = '';
  }
}

function populateFilters() {
  if (!aegisSheetDb || !aegisSheetDb.categories) return;

  const catSelect = document.querySelector('.aegis-explorer-category-select') as HTMLSelectElement;
  const ammoSelect = document.querySelector('.aegis-explorer-ammo-select') as HTMLSelectElement;
  if (!catSelect) return;

  const prevCat = catSelect.value;
  const selectedAmmo = ammoSelect ? ammoSelect.value : '';

  // Clear existing category options except the first one ("All Categories")
  catSelect.innerHTML = '<option value="">All Categories</option>';

  const categories = Object.keys(aegisSheetDb.categories).sort();
  for (const cat of categories) {
    if (selectedAmmo) {
      const weaponAmmo = AMMO_TYPE_MAP[cat] || 'Other';
      if (weaponAmmo !== selectedAmmo) continue;
    }

    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  }

  // Restore selection if still valid/available
  const hasPrevCat = Array.from(catSelect.options).some(opt => opt.value === prevCat);
  if (hasPrevCat) {
    catSelect.value = prevCat;
  } else {
    catSelect.value = '';
  }

  populateFramesFilter(catSelect.value);
}

function updateProgressIndicator() {
  let totalWeaponsCount = 0;
  let completedWeaponsCount = 0;
  if (aegisSheetDb && aegisSheetDb.weapons) {
    const uniqueWeapons = new Set<string>();
    for (const w of Object.values(aegisSheetDb.weapons)) {
      uniqueWeapons.add(w.name);
    }
    totalWeaponsCount = uniqueWeapons.size;
    for (const name of uniqueWeapons) {
      if (completedWeapons[name.toLowerCase().trim()]) {
        completedWeaponsCount++;
      }
    }
  }
  const progressText = document.querySelector('.aegis-explorer-progress-text');
  const progressBar = document.querySelector('.aegis-explorer-progress-bar') as HTMLElement;
  if (progressText && progressBar) {
    const pct = totalWeaponsCount > 0 ? Math.round((completedWeaponsCount / totalWeaponsCount) * 100) : 0;
    progressText.textContent = `Completed: ${completedWeaponsCount}/${totalWeaponsCount} (${pct}%)`;
    progressBar.style.width = `${pct}%`;
  }
}

/** Locates DIM's inventory search box. */
function getDimSearchInput(): HTMLInputElement | null {
  return document.querySelector('input[name="filter"], input[placeholder*="filter" i], input[type="search"]');
}

/**
 * Writes a query into DIM's search box and lets React pick it up.
 *
 * Assigning `.value` directly works here only because this script runs in the
 * ISOLATED world: the assignment hits the native setter rather than React's
 * value tracker, so the dispatched `input` event is not swallowed as a no-op.
 */
function setDimSearchValue(query: string) {
  const searchInput = getDimSearchInput();
  if (!searchInput) return;

  searchInput.value = query;
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  searchInput.dispatchEvent(new Event('change', { bubbles: true }));

  const wrapper = searchInput.parentElement;
  if (wrapper) {
    wrapper.classList.remove('aegis-search-flash');
    void wrapper.offsetWidth; // Force reflow
    wrapper.classList.add('aegis-search-flash');
  }
}

function triggerDimSearchForIds(instanceIds: string[]) {
  if (instanceIds.length === 0) return;
  setDimSearchValue(instanceIds.map(id => `id:${id}`).join(' or '));
}
function buildSelectHtml(currentValue: string, recommendedList: string[], globalSet: Set<string>) {
  const cleanRecs = recommendedList.map(r => r.toLowerCase().trim());
  const otherOptions = Array.from(globalSet)
    .filter(o => !cleanRecs.includes(o.toLowerCase().trim()))
    .sort();

  let html = `<option value="">Any</option>`;

  if (recommendedList.length > 0) {
    html += `
      <optgroup label="Recommended">
        ${recommendedList.map(r => `<option value="${r}" ${currentValue === r ? 'selected' : ''}>${r}</option>`).join('')}
      </optgroup>
    `;
  }

  if (otherOptions.length > 0) {
    html += `
      <optgroup label="All Others">
        ${otherOptions.map(o => `<option value="${o}" ${currentValue === o ? 'selected' : ''}>${o}</option>`).join('')}
      </optgroup>
    `;
  }

  return html;
}

function renderResults() {
  const resultsContainer = document.querySelector('.aegis-explorer-results') as HTMLElement;
  if (!resultsContainer) return;

  const db = aegisSheetDb;
  addDiagnosticLog(`renderResults called. activeTab: "${activeTab}". Has db: ${!!db}. Weapons count: ${db ? Object.keys(db.weapons || {}).length : 0}. Items in chaseList: ${JSON.stringify(Object.keys(chaseList))}`);

  if (!db || !db.weapons) {
    resultsContainer.innerHTML = '<div class="aegis-explorer-empty">Loading database...</div>';
    return;
  }

  try {
    // 1. CHASE LIST TAB RENDERER
    if (activeTab === 'chase') {
      updateProgressIndicator();
      let html = '';
      const items = Object.values(chaseList).sort((a, b) => a.name.localeCompare(b.name));

      if (items.length === 0) {
        resultsContainer.innerHTML = `
          <div class="aegis-explorer-empty" style="padding: 30px 15px; text-align: center; line-height: 1.5; color: #aaa;">
            Your chase list is empty.<br/><br/>
            Search for weapons in the <strong>Database Explorer</strong> tab and click <strong>+ Chase</strong> to pin them here!
          </div>
        `;
        return;
      }

      const pendingManifestRequests: string[] = [];
      for (const item of items) {
        try {
          const normName = item.name.toLowerCase().trim();
          const w = db.weapons[normName];
          const sourceStr = w?.source ? w.source : 'Unknown Source';

          const parseRecs = (str: string) => {
            if (!str) return [];
            return str.split(/[\/\n,]+/).map(s => s.trim()).filter(Boolean);
          };

          const barrels = w ? parseRecs(w.barrel) : [];
          const mags = w ? parseRecs(w.mag) : [];
          const perk1s = w ? parseRecs(w.perk1) : [];
          const perk2s = w ? parseRecs(w.perk2) : [];
          const origins = w ? parseRecs(w.origin) : [];

          const possiblePerks = weaponPossiblePerksCache[normName];
          const hasManifestPerks = possiblePerks && possiblePerks.isFromManifest;
          addDiagnosticLog(`Loop item: "${item.name}". w exists: ${!!w}. possiblePerks exists: ${!!possiblePerks} (isFromManifest: ${!!hasManifestPerks}). requestedHas: ${requestedWeapons.has(normName)}`);

          const lastFailure = failedWeaponRequests.get(normName) || 0;
          const canRetryManifestRequest = Date.now() - lastFailure >= WEAPON_PERK_RETRY_DELAY_MS;
          if (!hasManifestPerks && !requestedWeapons.has(normName) && canRetryManifestRequest) {
            pendingManifestRequests.push(normName);
            addDiagnosticLog(`Cache miss (or partial cache) for "${item.name}". Queueing possible perks from manifest...`);
          }

          // When Fiber data isn't available yet, fall back to the weapon's own sheet entry
          // so we at least show the sheet-recommended options rather than every perk in the game.
          const sheetBarrels = new Set(barrels);
          const sheetMags = new Set(mags);
          const sheetPerk1sSet = new Set(perk1s);
          const sheetPerk2sSet = new Set(perk2s);
          const sheetOrigins = new Set(origins);

          // Manifest data can be incomplete for unusual sockets. Keep sheet recommendations
          // and the saved selection available rather than replacing them with an empty list.
          const mergeOptions = (recommended: Set<string>, manifest: string[] | undefined, selected: string | undefined) =>
            new Set([...recommended, ...(manifest || []), ...(selected ? [selected] : [])]);
          const barrelsSet = mergeOptions(sheetBarrels, possiblePerks?.barrels, item.barrel);
          const magsSet = mergeOptions(sheetMags, possiblePerks?.mags, item.mag);
          // Column-specific perk sets: perk1sSet for column 3, perk2sSet for column 4.
          const perk1sSet = mergeOptions(sheetPerk1sSet, possiblePerks?.perk1s, item.perk1);
          const perk2sSet = mergeOptions(sheetPerk2sSet, possiblePerks?.perk2s, item.perk2);
          const perk1Alt1Set = mergeOptions(sheetPerk1sSet, possiblePerks?.perk1s, item.perk1Alt1);
          const perk2Alt1Set = mergeOptions(sheetPerk2sSet, possiblePerks?.perk2s, item.perk2Alt1);
          const perk1Alt2Set = mergeOptions(sheetPerk1sSet, possiblePerks?.perk1s, item.perk1Alt2);
          const perk2Alt2Set = mergeOptions(sheetPerk2sSet, possiblePerks?.perk2s, item.perk2Alt2);
          const originsSet = mergeOptions(sheetOrigins, possiblePerks?.origins, item.origin);

          // Scan owned matching weapons
          const owned = Array.from(ownedItemsMap.values()).filter(oi => oi.name.toLowerCase().trim() === normName);
          const matches: string[] = [];

          for (const oi of owned) {
            let match = true;
            const failedSelections: string[] = [];

            const checkPerkMatch = (selectedPerk: string | undefined, label: string) => {
              if (!selectedPerk) return true;
              const norm = selectedPerk.toLowerCase().trim();
              const clean = cleanPerkName(selectedPerk);
              // 1. Fast path: hash lookup
              const targetHash = perkNameToHash[norm] ?? perkNameToHash[clean];
              if (targetHash !== undefined) {
                const hashMatch = oi.perkHashes.some(hash =>
                  hash === targetHash || enhancedToNormalMap[hash] === targetHash
                );
                if (hashMatch) return true;
              }
              // 2. Name comparison handles late registry hydration, enhanced traits,
              // and DIM display-name punctuation differences.
              const selectedMatchName = cleanPerkNameForMatch(selectedPerk);
              const nameMatch = oi.perkNames.some(ownedPerk =>
                isPerkMatch(ownedPerk, selectedPerk) ||
                isPerkMatch(cleanPerkNameForMatch(ownedPerk), selectedMatchName)
              );
              if (!nameMatch) failedSelections.push(`${label}: ${selectedPerk}`);
              return nameMatch;
            };

            if (!checkPerkMatch(item.barrel, 'Barrel')) match = false;
            if (!checkPerkMatch(item.mag, 'Magazine')) match = false;
            if (!checkPerkMatch(item.perk1, 'Perk 1')) match = false;
            if (item.perk1Alt1 && !checkPerkMatch(item.perk1Alt1, 'Perk 1 (Slot B)')) match = false;
            if (item.perk1Alt2 && !checkPerkMatch(item.perk1Alt2, 'Perk 1 (Slot C)')) match = false;
            if (!checkPerkMatch(item.perk2, 'Perk 2')) match = false;
            if (item.perk2Alt1 && !checkPerkMatch(item.perk2Alt1, 'Perk 2 (Slot B)')) match = false;
            if (item.perk2Alt2 && !checkPerkMatch(item.perk2Alt2, 'Perk 2 (Slot C)')) match = false;
            if (item.origin && !checkPerkMatch(item.origin, 'Origin')) match = false;

            if (match) {
              matches.push(oi.instanceId);
            } else if (failedSelections.length > 0) {
              addDiagnosticLog(`Chase match failed for "${item.name}" instance ${oi.instanceId}: ${failedSelections.join('; ')}`);
            }
          }

          let statusHtml = '';
          let highlightBtnHtml = '';
          if (owned.length === 0) {
            statusHtml = `<span class="aegis-chase-status aegis-status-none">🔴 Not in Inventory</span>`;
          } else if (matches.length > 0) {
            statusHtml = `<span class="aegis-chase-status aegis-status-match">🟢 Obtained (${matches.length} matching)</span>`;
            highlightBtnHtml = `<button class="aegis-action-btn" data-action="highlight-matching" data-ids="${matches.join(',')}" style="flex: none !important; height: 28px !important; padding: 0 10px !important; font-size: 11px !important; background: rgba(30, 215, 96, 0.08) !important; border: 1px solid rgba(30, 215, 96, 0.25) !important; color: #1ed760 !important; cursor: pointer !important; font-weight: 600 !important; border-radius: 6px !important;">Highlight in Vault</button>`;
          } else {
            statusHtml = `<span class="aegis-chase-status aegis-status-have-weapon">🟡 Have weapon, wrong perks</span>`;
          }

          const baseNameForReport = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
          const weaponHashForReport = nameToHash[normName] || nameToHash[baseNameForReport];
          let destinyReportBtnHtml = '';
          if (weaponHashForReport) {
            destinyReportBtnHtml = `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/w/${weaponHashForReport}" target="_blank" rel="noopener noreferrer" style="flex: none !important; padding: 0 10px !important;">Destiny.Report ↗</a>`;
          } else {
            destinyReportBtnHtml = `<button class="aegis-action-btn aegis-btn-disabled" title="Weapon ID not resolved. Ensure the weapon is in your wishlist or has been viewed/scanned on screen in DIM." disabled style="flex: none !important; padding: 0 10px !important;">Destiny.Report (Unknown ID)</button>`;
          }
          const isExpanded = expandedChaseWeapons.has(normName);
          const isCompleted = !!completedWeapons[normName];
          html += `
            <div class="aegis-chase-row ${isExpanded ? 'expanded' : ''} ${isCompleted ? 'completed' : ''}" data-weapon-name="${item.name.replace(/"/g, '&quot;')}">
              <div class="aegis-chase-row-header">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="aegis-chase-chevron" style="font-size: 10px; color: #888; transition: transform 0.2s ease; display: inline-block;">▶</span>
                  <label class="aegis-checklist-toggle" style="display: flex; align-items: center; cursor: pointer;" title="Mark as obtained/completed">
                    <input type="checkbox" class="aegis-chase-completed-checkbox" ${isCompleted ? 'checked' : ''} style="margin: 0; cursor: pointer;" />
                  </label>
                  <span class="aegis-chase-name">${item.name}</span>
                </div>
                <button class="aegis-chase-delete" data-action="delete-chase" title="Remove from Chase List">&times;</button>
              </div>
              <div class="aegis-chase-meta">
                Source: ${sourceStr}
              </div>
              <div class="aegis-chase-selectors">
                <div class="aegis-chase-select-group">
                  <label>Barrel</label>
                  <select class="aegis-chase-select" data-type="barrel">
                    ${buildSelectHtml(item.barrel, barrels, barrelsSet)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Mag</label>
                  <select class="aegis-chase-select" data-type="mag">
                    ${buildSelectHtml(item.mag, mags, magsSet)}
                  </select>
                </div>

                <div class="aegis-chase-select-group">
                  <label>Perk 1 (Slot A)</label>
                  <select class="aegis-chase-select" data-type="perk1">
                    ${buildSelectHtml(item.perk1, perk1s, perk1sSet)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Perk 2 (Slot A)</label>
                  <select class="aegis-chase-select" data-type="perk2">
                    ${buildSelectHtml(item.perk2, perk2s, perk2sSet)}
                  </select>
                </div>

                <div class="aegis-chase-select-group">
                  <label>Perk 1 (Slot B)</label>
                  <select class="aegis-chase-select" data-type="perk1Alt1">
                    ${buildSelectHtml(item.perk1Alt1 || '', perk1s, perk1Alt1Set)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Perk 2 (Slot B)</label>
                  <select class="aegis-chase-select" data-type="perk2Alt1">
                    ${buildSelectHtml(item.perk2Alt1 || '', perk2s, perk2Alt1Set)}
                  </select>
                </div>

                <div class="aegis-chase-select-group">
                  <label>Perk 1 (Slot C)</label>
                  <select class="aegis-chase-select" data-type="perk1Alt2">
                    ${buildSelectHtml(item.perk1Alt2 || '', perk1s, perk1Alt2Set)}
                  </select>
                </div>
                <div class="aegis-chase-select-group">
                  <label>Perk 2 (Slot C)</label>
                  <select class="aegis-chase-select" data-type="perk2Alt2">
                    ${buildSelectHtml(item.perk2Alt2 || '', perk2s, perk2Alt2Set)}
                  </select>
                </div>

                <div class="aegis-chase-select-group span-2">
                  <label>Origin</label>
                  <select class="aegis-chase-select" data-type="origin">
                    ${buildSelectHtml(item.origin || '', origins, originsSet)}
                  </select>
                </div>
              </div>
              <div class="aegis-chase-status-row" style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                ${statusHtml}
                <div style="display: flex; gap: 6px; align-items: center;">
                  ${highlightBtnHtml}
                  ${destinyReportBtnHtml}
                </div>
              </div>
            </div>
          `;
        } catch (e: any) {
          addDiagnosticLog(`Error processing item "${item?.name}": ${e.message}\n${e.stack}`);
        }
      }

      // Send one batched request after every card has been inspected. The old
      // one-attribute-per-card approach overwrote earlier requests during a render.
      if (pendingManifestRequests.length > 0) {
        const registryEl = document.getElementById('aegis-global-perk-registry');
        if (registryEl) {
          const requestNames = [...new Set(pendingManifestRequests)];
          requestNames.forEach(name => requestedWeapons.add(name));
          registryEl.setAttribute('data-request-weapon-perks', JSON.stringify(requestNames));
        }
      }

      resultsContainer.innerHTML = html;
      // Bind Chase List event handlers
      const chaseRows = resultsContainer.querySelectorAll('.aegis-chase-row');
      chaseRows.forEach(row => {
        const name = row.getAttribute('data-weapon-name');
        if (!name) return;
        const norm = name.toLowerCase().trim();

        row.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.aegis-chase-select') || target.closest('[data-action="delete-chase"]') || target.closest('[data-action="highlight-matching"]') || target.closest('.aegis-checklist-toggle')) {
            return;
          }
          const currentlyExpanded = row.classList.toggle('expanded');
          if (currentlyExpanded) {
            expandedChaseWeapons.add(norm);
          } else {
            expandedChaseWeapons.delete(norm);
          }
        });

        const checkbox = row.querySelector('.aegis-chase-completed-checkbox') as HTMLInputElement;
        if (checkbox) {
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
          });
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
              completedWeapons[norm] = true;
              row.classList.add('completed');
            } else {
              delete completedWeapons[norm];
              row.classList.remove('completed');
            }
            chrome.storage.local.set({ aegisCompletedWeapons: completedWeapons });
            updateProgressIndicator();
            renderResults();
          });
        }

        const deleteBtn = row.querySelector('[data-action="delete-chase"]');
        deleteBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          delete chaseList[norm];
          chrome.storage.local.set({ aegisChaseList: chaseList });
          renderResults();
        });

        const highlightBtn = row.querySelector('[data-action="highlight-matching"]');
        highlightBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          const idsAttr = highlightBtn.getAttribute('data-ids') || '';
          const ids = idsAttr.split(',').filter(Boolean);
          if (ids.length > 0) {
            triggerDimSearchForIds(ids);
          }
        });

        const selects = row.querySelectorAll('.aegis-chase-select');
        selects.forEach(select => {
          select.addEventListener('change', () => {
            const type = select.getAttribute('data-type') as 'barrel' | 'mag' | 'perk1' | 'perk1Alt1' | 'perk1Alt2' | 'perk2' | 'perk2Alt1' | 'perk2Alt2' | 'origin';
            const val = (select as HTMLSelectElement).value;
            if (chaseList[norm] && type) {
              chaseList[norm][type] = val;
              chrome.storage.local.set({ aegisChaseList: chaseList });
              renderResults();
            }
          });
        });
      });

      return;
    }

    // 2. EXPLORER DATABASE TAB RENDERER
    updateProgressIndicator();

    const searchInput = document.querySelector('.aegis-explorer-search-input') as HTMLInputElement;
    const catSelect = document.querySelector('.aegis-explorer-category-select') as HTMLSelectElement;
    const frameSelect = document.querySelector('.aegis-explorer-frame-select') as HTMLSelectElement;
    const elementSelect = document.querySelector('.aegis-explorer-element-select') as HTMLSelectElement;
    const ammoSelect = document.querySelector('.aegis-explorer-ammo-select') as HTMLSelectElement;
    const hideCompletedCheckbox = document.querySelector('.aegis-explorer-hide-completed') as HTMLInputElement | null;

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedCat = catSelect ? catSelect.value : '';
    const selectedFrame = frameSelect ? frameSelect.value : '';
    const selectedElement = elementSelect ? elementSelect.value : '';
    const selectedAmmo = ammoSelect ? ammoSelect.value : '';
    const hideCompleted = hideCompletedCheckbox ? hideCompletedCheckbox.checked : false;

    const matches: { weapon: AegisSheetWeapon; category: string }[] = [];

    for (const [cat, list] of Object.entries(db.categories)) {
      if (selectedCat && cat !== selectedCat) continue;
      const weaponAmmo = AMMO_TYPE_MAP[cat] || 'Other';
      if (selectedAmmo && weaponAmmo !== selectedAmmo) continue;

      for (const w of list) {
        const normName = w.name.toLowerCase().trim();
        if (hideCompleted && completedWeapons[normName]) continue;
        if (selectedFrame && w.frame !== selectedFrame) continue;
        if (selectedElement && w.energy.toLowerCase().trim() !== selectedElement.toLowerCase().trim()) continue;
        if (query) {
          const nameMatch = w.name.toLowerCase().includes(query);
          const notesMatch = w.notes.toLowerCase().includes(query);
          const frameMatch = w.frame.toLowerCase().includes(query);
          const perksMatch = (w.perk1 + ' ' + w.perk2).toLowerCase().includes(query);
          if (!nameMatch && !notesMatch && !frameMatch && !perksMatch) continue;
        }
        matches.push({ weapon: w, category: cat });
      }
    }

    matches.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      const rA = parseInt(a.weapon.rank, 10);
      const rB = parseInt(b.weapon.rank, 10);
      return (isNaN(rA) ? 999 : rA) - (isNaN(rB) ? 999 : rB);
    });

    if (matches.length === 0) {
      resultsContainer.innerHTML = '<div class="aegis-explorer-empty">No matching weapons found.</div>';
      return;
    }

    let html = '';
    for (const m of matches) {
      const w = m.weapon;
      const normName = w.name.toLowerCase().trim();
      const isCompleted = !!completedWeapons[normName];
      const completedClass = isCompleted ? 'completed' : '';
      
      const tierLetter = w.tier ? w.tier.charAt(0).toLowerCase() : '';
      const tierClass = `aegis-tier-${tierLetter}`;
      const rankLabel = w.rank ? (w.rank === '1' ? '👑 Best in Archetype' : `#${w.rank}`) : '-';

      const baseName = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
      const weaponHash = nameToHash[normName] || nameToHash[baseName];

      let destinyReportBtnHtml = '';
      if (weaponHash) {
        destinyReportBtnHtml = `<a class="aegis-action-btn aegis-btn-report" href="https://destiny.report/w/${weaponHash}" target="_blank" rel="noopener noreferrer">Destiny.Report ↗</a>`;
      } else {
        destinyReportBtnHtml = `<button class="aegis-action-btn aegis-btn-disabled" title="Weapon ID not resolved. Ensure the weapon is in your wishlist or has been viewed/scanned on screen in DIM." disabled>Destiny.Report (Unknown ID)</button>`;
      }

      const isChasing = !!chaseList[normName];
      const chaseText = isChasing ? 'Remove Chase' : '+ Chase';
      const chaseClass = isChasing ? 'aegis-btn-chase-active' : '';

      html += `
        <div class="aegis-explorer-row ${completedClass}" data-weapon-name="${w.name.replace(/"/g, '&quot;')}">
          <div class="aegis-explorer-row-header">
            <label class="aegis-checklist-toggle" style="display: flex; align-items: center; margin-right: 8px; cursor: pointer;" title="Mark as obtained/completed">
              <input type="checkbox" class="aegis-checklist-checkbox" ${isCompleted ? 'checked' : ''} style="margin: 0; cursor: pointer;" />
            </label>
            <span class="aegis-explorer-row-name">${w.name}</span>
            <div class="aegis-explorer-row-badges">
              <span class="aegis-explorer-row-badge ${tierClass}">${w.tier || 'F'}</span>
              <span class="aegis-explorer-row-rank">${rankLabel}</span>
            </div>
          </div>
          <div class="aegis-explorer-row-details">
            <span class="aegis-explorer-row-meta">${w.energy} / ${w.frame}</span>
            <span class="aegis-explorer-row-cat">${m.category}</span>
            ${w.source ? `<div class="aegis-explorer-row-source" style="margin-top: 4px; font-size: 11px; color: #ffd700;"><span style="color: #aaa; font-weight: 500;">Source:</span> ${w.source}</div>` : ''}
          </div>
          ${w.notes ? `<div class="aegis-explorer-row-notes">${w.notes}</div>` : ''}
          <div class="aegis-explorer-row-actions">
            <button class="aegis-action-btn aegis-btn-highlight" data-action="filter-vault">Filter in Vault</button>
            <button class="aegis-action-btn aegis-btn-chase ${chaseClass}" data-action="chase-weapon">${chaseText}</button>
            ${destinyReportBtnHtml}
          </div>
        </div>
      `;
    }

    resultsContainer.innerHTML = html;

    // Bind Explorer List event handlers
    const rows = resultsContainer.querySelectorAll('.aegis-explorer-row');
    rows.forEach((row) => {
      const name = row.getAttribute('data-weapon-name');
      if (!name) return;
      const norm = name.toLowerCase().trim();
      const w = db.weapons[norm];

      // Row expand listener
      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.aegis-explorer-row-actions') || target.closest('.aegis-checklist-toggle')) {
          return;
        }
        
        // Accordion: collapse other rows
        rows.forEach((otherRow) => {
          if (otherRow !== row) {
            otherRow.classList.remove('expanded');
          }
        });

        row.classList.toggle('expanded');
      });

      // Checklist checkbox change listener
      const checkbox = row.querySelector('.aegis-checklist-checkbox') as HTMLInputElement;
      if (checkbox) {
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            completedWeapons[norm] = true;
            row.classList.add('completed');
          } else {
            delete completedWeapons[norm];
            row.classList.remove('completed');
          }
          chrome.storage.local.set({ aegisCompletedWeapons: completedWeapons });
          updateProgressIndicator();
          if (hideCompleted) {
            renderResults();
          }
        });
      }

      // Filter in Vault button listener
      const highlightBtn = row.querySelector('[data-action="filter-vault"]');
      highlightBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerDimSearch(norm);
      });

      // Toggle Chase button listener
      const chaseBtn = row.querySelector('[data-action="chase-weapon"]') as HTMLButtonElement;
      if (chaseBtn && w) {
        chaseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (chaseList[norm]) {
            delete chaseList[norm];
            chaseBtn.classList.remove('aegis-btn-chase-active');
            chaseBtn.textContent = '+ Chase';
          } else {
            const parseRecs = (str: string) => {
              if (!str) return [];
              return str.split(/[\/\n,]+/).map(s => s.trim()).filter(Boolean);
            };
            const perk1s = parseRecs(w.perk1);
            const perk2s = parseRecs(w.perk2);

            chaseList[norm] = {
              name: w.name,
              // Trait rolls are the chase defaults.  Barrel, magazine, and origin
              // selections remain optional filters rather than silently rejecting
              // a weapon that has the requested trait pair.
              barrel: '',
              mag: '',
              perk1: perk1s[0] || '',
              perk1Alt1: '',
              perk1Alt2: '',
              perk2: perk2s[0] || '',
              perk2Alt1: '',
              perk2Alt2: '',
              origin: '',
            };
            chaseBtn.classList.add('aegis-btn-chase-active');
            chaseBtn.textContent = 'Remove Chase';
          }
          chrome.storage.local.set({ aegisChaseList: chaseList });
          renderResults();
        });
      }

      // Destiny.Report button listener
      const reportBtn = row.querySelector('.aegis-btn-report');
      if (reportBtn) {
        reportBtn.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
    });
  } catch (e: any) {
    addDiagnosticLog(`Error in renderResults: ${e.message}\n${e.stack}`);
    const resultsContainer = document.querySelector('.aegis-explorer-results') as HTMLElement;
    if (resultsContainer) {
      resultsContainer.innerHTML = `<div class="aegis-explorer-empty">Error rendering: ${e.message}</div>`;
    }
  }
}

function triggerDimSearch(weaponName: string) {
  setDimSearchValue(`name:"${weaponName}"`);
}

function initAegisExplorer() {
  if (!document.body || document.querySelector('.aegis-fab')) return;

  const fab = document.createElement('div');
  fab.className = 'aegis-fab';
  fab.title = 'Open Aegis Database Explorer';
  fab.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffd700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  `;

  const panel = document.createElement('div');
  panel.className = 'aegis-explorer-panel';
  panel.innerHTML = `
    <div class="aegis-explorer-header">
      <span class="aegis-explorer-title">Aegis Database Explorer</span>
      <button class="aegis-explorer-close" title="Close Explorer">&times;</button>
    </div>
    <div class="aegis-explorer-tabs">
      <button class="aegis-explorer-tab active" data-tab="explorer">Database Explorer</button>
      <button class="aegis-explorer-tab" data-tab="chase">My Chase List</button>
    </div>
    <div class="aegis-explorer-search-group">
      <input type="text" class="aegis-explorer-search-input" placeholder="Search weapon, notes, perks..." />
      <div class="aegis-explorer-selects">
        <select class="aegis-explorer-category-select">
          <option value="">All Categories</option>
        </select>
        <select class="aegis-explorer-frame-select">
          <option value="">All Frames</option>
        </select>
      </div>
      <div class="aegis-explorer-selects">
        <select class="aegis-explorer-element-select">
          <option value="">All Elements</option>
          <option value="Kinetic">Kinetic</option>
          <option value="Arc">Arc</option>
          <option value="Solar">Solar</option>
          <option value="Void">Void</option>
          <option value="Stasis">Stasis</option>
          <option value="Strand">Strand</option>
        </select>
        <select class="aegis-explorer-ammo-select">
          <option value="">All Ammo</option>
          <option value="Primary">Primary</option>
          <option value="Special">Special</option>
          <option value="Heavy">Heavy</option>
        </select>
      </div>
      <div class="aegis-explorer-sub-controls">
        <label class="aegis-explorer-checkbox-label">
          <input type="checkbox" class="aegis-explorer-hide-completed" />
          Hide Checked-off
        </label>
        <div class="aegis-explorer-progress-container">
          <span class="aegis-explorer-progress-text">Completed: 0/0 (0%)</span>
          <div class="aegis-explorer-progress-bg">
            <div class="aegis-explorer-progress-bar"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="aegis-explorer-results">
      <div class="aegis-explorer-empty">Loading database...</div>
    </div>
    <details class="aegis-diagnostic-logs" style="border-top: 1px solid #333; margin-top: auto; font-size: 10px; font-family: monospace; color: #aaa; background: #161a22; padding: 4px 8px; flex-shrink: 0; display: flex; flex-direction: column;">
      <summary style="cursor: pointer; padding: 4px 0; color: #ffd700; font-weight: bold; user-select: none;">Aegis Diagnostic Logs</summary>
      <div class="aegis-diagnostic-logs-content" style="max-height: 120px; overflow-y: auto; white-space: pre-wrap; margin-top: 4px; padding-bottom: 8px; font-size: 9px; line-height: 1.3;"></div>
    </details>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const diagContent = panel.querySelector('.aegis-diagnostic-logs-content');
  if (diagContent) {
    diagContent.textContent = diagnosticLogs.join('\n') + (diagnosticLogs.length > 0 ? '\n' : '');
  }

  const closeBtn = panel.querySelector('.aegis-explorer-close');
  const searchInput = panel.querySelector('.aegis-explorer-search-input');
  const catSelect = panel.querySelector('.aegis-explorer-category-select');
  const frameSelect = panel.querySelector('.aegis-explorer-frame-select');
  const elementSelect = panel.querySelector('.aegis-explorer-element-select');
  const ammoSelect = panel.querySelector('.aegis-explorer-ammo-select');
  const hideCompletedCheckbox = panel.querySelector('.aegis-explorer-hide-completed');

  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      populateFilters();
      renderResults();
    }
  });

  closeBtn?.addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Tab switching setup
  const tabs = panel.querySelectorAll('.aegis-explorer-tab');
  const searchGroup = panel.querySelector('.aegis-explorer-search-group') as HTMLElement;
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-tab') || 'explorer';

      if (activeTab === 'chase') {
        if (searchGroup) searchGroup.style.display = 'none';
      } else {
        if (searchGroup) searchGroup.style.display = 'flex';
      }
      renderResults();
    });
  });

  const onUpdate = () => {
    renderResults();
  };

  searchInput?.addEventListener('input', onUpdate);
  catSelect?.addEventListener('change', () => {
    populateFramesFilter((catSelect as HTMLSelectElement).value);
    onUpdate();
  });
  frameSelect?.addEventListener('change', onUpdate);
  elementSelect?.addEventListener('change', onUpdate);
  ammoSelect?.addEventListener('change', () => {
    populateFilters();
    onUpdate();
  });
  hideCompletedCheckbox?.addEventListener('change', onUpdate);
}

function showWelcomeModal() {
  if (document.querySelector('.aegis-welcome-backdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'aegis-welcome-backdrop';

  backdrop.innerHTML = `
    <div class="aegis-welcome-modal">
      <div class="aegis-welcome-header">
        <span class="aegis-welcome-title">Welcome to DIM Aegis Overlay</span>
        <button class="aegis-welcome-close" title="Dismiss Tutorial">&times;</button>
      </div>
      
      <div class="aegis-welcome-slides">
        <!-- Slide 1: Welcome & Disclaimer -->
        <div class="aegis-welcome-slide active" data-slide="0">
          <div class="tooltip-section">
            <span class="tooltip-section-header">Getting Started</span>
            <p class="tooltip-desc" style="font-size: 12.5px; line-height: 1.5; margin-top: 6px; margin-bottom: 12px;">
              This extension enhances Destiny Item Manager (DIM) by displaying meta spreadsheet weapon rankings, perk accuracy ratings, and custom armor set configurations directly on your items.
            </p>
            
            <div class="tooltip-divider" style="margin: 12px 0;"></div>
            
            <div class="tooltip-note" style="border: 1px solid rgba(231, 76, 60, 0.4); background: rgba(231, 76, 60, 0.08); padding: 12px; border-radius: 8px; font-size: 11.5px; color: #ff9f9f; line-height: 1.5; margin-bottom: 12px;">
              <strong>⚠️ DISCLAIMER:</strong> The Aegis database source is primarily a <strong>PvE Endgame spreadsheet</strong>. Some weapons or perk combinations that excel in PvP or casual play may score lower.
            </div>
            
            <p class="tooltip-desc" style="font-size: 11.5px; line-height: 1.5; color: #b1b1ba; margin-top: 8px;">
              Click <strong>Next</strong> to start the quick tour of features, or use the navigation dots below.
            </p>
          </div>
        </div>

        <!-- Slide 2: Scoring & Grades Guide -->
        <div class="aegis-welcome-slide" data-slide="1">
          <div class="tooltip-section">
            <span class="tooltip-section-header">Scoring & Grades Guide</span>
            <span class="tooltip-section-header" style="margin-top: 6px; font-size: 9.5px; color: #ffd700;">1. Standard Grading (Match Accuracy)</span>
            
            <div class="tooltip-grid" style="margin-top: 6px; row-gap: 5px; column-gap: 10px;">
              <span class="grade-pill grade-s-pill">S+</span><span>Traits 1 & 2 + Mag + Barrel + Origin</span>
              <span class="grade-pill grade-s-pill">S</span><span>Traits 1 & 2 + Magazine matched</span>
              <span class="grade-pill grade-a-pill">A+</span><span>Traits 1 & 2 + Barrel matched</span>
              <span class="grade-pill grade-a-pill">A</span><span>Traits 1 & 2 both matched</span>
              <span class="grade-pill grade-b-pill">B+</span><span>1 Trait active + 1 selectable + Mag/Barrel</span>
              <span class="grade-pill grade-b-pill">B</span><span>1 Trait active + 1 selectable Trait</span>
              <span class="grade-pill grade-c-pill">C</span><span>1 Trait matched + Magazine or Barrel</span>
              <span class="grade-pill grade-d-pill">D</span><span>Only 1 Trait matched</span>
              <span class="grade-pill grade-f-pill">F</span><span>Underperforming (no Traits matched)</span>
            </div>
            <span class="tooltip-note" style="display: block; margin-top: 4px; margin-bottom: 8px;">*Main Traits 1 & 2 must match to score A or higher.</span>
            
            <div class="tooltip-divider" style="margin: 8px 0;"></div>
            
            <p class="tooltip-desc" style="margin-bottom: 6px; font-size: 10.5px;"><strong>Perk Details Previews:</strong> Hovering weapons in DIM displays scoring overlays:</p>
            <div style="display: flex; justify-content: center; margin-top: 4px;">
              <img src="${chrome.runtime.getURL('aegis_recommended_perks.png')}" style="width: 500px; height: 220px; object-fit: cover; object-position: top; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #12121a;" alt="Recommended Perks Overlay" />
            </div>
          </div>
        </div>

        <!-- Slide 3: 2-Tier System -->
        <div class="aegis-welcome-slide" data-slide="2">
          <div class="tooltip-section">
            <span class="tooltip-section-header">2. 2-Tier System (e.g. BS+, SF)</span>
            <p class="tooltip-desc">Combines weapon meta tier with roll accuracy:</p>
            
            <div class="two-tier-demo-wrapper" style="margin-top: 8px; margin-bottom: 8px; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 6px; padding: 12px; display: flex; align-items: center; gap: 16px;">
              <img src="${chrome.runtime.getURL('two-tier-demo.png')}" class="two-tier-demo-img" style="width: 72px; height: auto; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.1);" alt="2-tier grade badge demo" />
              <div class="two-tier-demo-text" style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                <div class="tooltip-formula" style="margin: 0; padding: 4px 8px; font-size: 10.5px; background: #08080c; border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; color: #ffb300; text-align: center; font-weight: 700;">[Archetype Tier] [Roll Grade]</div>
                <span class="tooltip-note" style="font-size: 10px;">Example: <b>BS+</b> means archetype is <b>B-Tier</b>, but your roll is a perfect <b>S+</b>.</span>
              </div>
            </div>
            
            <p class="tooltip-desc" style="font-size: 11.5px; line-height: 1.45;">
              - <strong>First Letter (Weapon Meta Ranking):</strong> Always sourced from Aegis' endgame PvE spreadsheet archetype rankings.<br/>
              - <strong>Second Letter (Perk Synergy Grade):</strong> Sourced from Aegis' recommended perks by default, or your own synced custom DIM wishlist.
            </p>
            
            <div style="display: flex; justify-content: center; margin-top: 6px; margin-bottom: 6px;">
              <img src="${chrome.runtime.getURL('wishlist_configuration.png')}" style="width: 320px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #12121a;" alt="Wishlist settings preview" />
            </div>
            
            <div class="tooltip-divider" style="margin: 6px 0;"></div>
            
            <div class="tooltip-note" style="border: 1px solid rgba(255, 215, 0, 0.25); background: rgba(255, 215, 0, 0.04); padding: 8px; border-radius: 6px; font-size: 10.5px; line-height: 1.4; color: #ffd700;">
              <strong>💡 How to Enable:</strong> Open the extension settings popup by clicking the <strong>puzzle piece / Aegis icon</strong> in your browser's toolbar (top right), then toggle the <strong>2-Tier System</strong> setting switch.
            </div>
          </div>
        </div>

        <!-- Slide 4: Database Explorer & Chase List -->
        <div class="aegis-welcome-slide" data-slide="3">
          <div class="tooltip-section">
            <span class="tooltip-section-header">Database Explorer & Chase List</span>
            <p class="tooltip-desc">Easily browse recommendations and build your dream loadouts:</p>
            <div style="display: flex; gap: 14px; justify-content: center; margin-top: 6px; margin-bottom: 8px;">
              <img src="${chrome.runtime.getURL('database_explorer_tab.png')}" style="width: 200px; height: auto; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #12121a;" alt="Database Explorer" />
              <img src="${chrome.runtime.getURL('chase_list_tab.png')}" style="width: 200px; height: auto; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #12121a;" alt="Chase List" />
            </div>
            <p class="tooltip-desc"><strong>Database Explorer:</strong> Click the floating magnifying glass on the bottom right of DIM to search weapons, elements, and frames.</p>
            <p class="tooltip-desc" style="margin-top: 4px;"><strong>My Chase List:</strong> Add weapons to your Chase List, choose your target rolls, and filter/highlight them in your vault with a single click.</p>
          </div>
        </div>

        <!-- Slide 5: Vault Search Filtering -->
        <div class="aegis-welcome-slide" data-slide="4">
          <div class="tooltip-section">
            <span class="tooltip-section-header">3. Vault Search Filtering</span>
            <p class="tooltip-desc">Type these filters directly into the DIM search bar:</p>
            
            <div class="search-filter-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 6px; font-size: 11px;">
              <div class="filter-group" style="display: flex; flex-direction: column; gap: 6px;">
                <div class="filter-group-title" style="font-weight: 700; color: #ffb300; text-transform: uppercase; font-size: 9.5px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 2px;">Weapons</div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:w:b</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Filters by weapon tier (e.g., B-Tier archetype)</span>
                </div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:p:s+</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Filters by perk roll grade (e.g., S+ roll quality)</span>
                </div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:bs+</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Filters by exact 2-tier combo (B archetype, S+ roll)</span>
                </div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:god</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Highlights all S and S+ perk rolls</span>
                </div>
                <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                  <code class="filter-code" style="align-self: flex-start;">aegis:upgrade</code>
                  <span class="tooltip-desc" style="font-size: 10px;">Highlights weapons with unselected better perk choices</span>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                <div class="filter-group" style="display: flex; flex-direction: column; gap: 6px;">
                  <div class="filter-group-title" style="font-weight: 700; color: #ffb300; text-transform: uppercase; font-size: 9.5px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 2px;">Armor (Set Bonuses)</div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:a:2p:s</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filters armor by 2pc set bonus grade (e.g., S-Tier)</span>
                  </div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:a:4p:a</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filters armor by 4pc set bonus grade (e.g., A-Tier)</span>
                  </div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:a:s/a</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filters armor with exact combined 2pc S / 4pc A</span>
                  </div>
                </div>
                <div class="filter-group" style="display: flex; flex-direction: column; gap: 6px;">
                  <div class="filter-group-title" style="font-weight: 700; color: #ffb300; text-transform: uppercase; font-size: 9.5px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 2px;">Operators (Universal)</div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:p:&gt;=b</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filter perks B or better (works with w:, 2p:, 4p:)</span>
                  </div>
                  <div class="filter-item" style="display: flex; flex-direction: column; gap: 2px;">
                    <code class="filter-code" style="align-self: flex-start;">aegis:w:&gt;a</code>
                    <span class="tooltip-desc" style="font-size: 10px;">Filter weapons strictly higher than A-Tier</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="tooltip-divider" style="margin: 8px 0;"></div>
            <p class="tooltip-note"><strong>Tag &amp; manage matches:</strong> These filters only highlight items, so DIM's item count and bulk actions can't see them. Click <strong>Apply to DIM</strong> under the search bar to rewrite the query into DIM's own <code class="filter-code">id:</code>/<code class="filter-code">hash:</code> terms &mdash; then the item count appears and <em>Tag as 'Favorite'</em>, <em>Tag as 'Junk'</em>, Lock and Compare all work on the results. Press the <strong>&times;</strong> on the chip to get your <code class="filter-code">aegis:</code> text back. Aegis filters combine with normal DIM terms, e.g. <code class="filter-code">aegis:w:&gt;a is:smg</code>.</p>
            <p class="tooltip-note"><strong>Pro-Tip:</strong> Want to use your own wishlist? You can sync and toggle custom DIM wishlists in the settings popup anytime.</p>
          </div>
        </div>

        <!-- Slide 6: Support the Project -->
        <div class="aegis-welcome-slide" data-slide="5">
          <div class="tooltip-section">
            <span class="tooltip-section-header">Support the Project</span>
            <p class="tooltip-desc" style="font-size: 12.5px; line-height: 1.5; margin-top: 6px; margin-bottom: 12px;">This extension is free and open-source, maintained to help fellow Guardians build their perfect vaults.</p>
            <p class="tooltip-desc" style="margin-bottom: 20px;">If you find the tool useful, please consider supporting development costs or Chrome Web Store hosting.</p>
            
            <div style="display: flex; justify-content: center; margin-bottom: 20px;">
              <a href="https://ko-fi.com/dilligafm8" target="_blank" rel="noopener noreferrer" class="aegis-welcome-kofi-btn">
                Support on Ko-fi
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="aegis-welcome-footer">
        <label class="aegis-welcome-dismiss-checkbox">
          <input type="checkbox" id="aegis-welcome-dont-show" />
          Do not show this again
        </label>
        
        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="aegis-welcome-dots">
            <span class="aegis-welcome-dot active" data-index="0"></span>
            <span class="aegis-welcome-dot" data-index="1"></span>
            <span class="aegis-welcome-dot" data-index="2"></span>
            <span class="aegis-welcome-dot" data-index="3"></span>
            <span class="aegis-welcome-dot" data-index="4"></span>
            <span class="aegis-welcome-dot" data-index="5"></span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="aegis-welcome-back-btn" style="display: none;">Back</button>
            <button class="aegis-welcome-next-btn">Next</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  let currentSlide = 0;
  const totalSlides = 6;
  const slides = backdrop.querySelectorAll('.aegis-welcome-slide');
  const dots = backdrop.querySelectorAll('.aegis-welcome-dot');
  const nextBtn = backdrop.querySelector('.aegis-welcome-next-btn') as HTMLButtonElement;
  const backBtn = backdrop.querySelector('.aegis-welcome-back-btn') as HTMLButtonElement;
  const closeBtn = backdrop.querySelector('.aegis-welcome-close');
  const dontShowCheckbox = backdrop.querySelector('#aegis-welcome-dont-show') as HTMLInputElement;

  function updateSlide(index: number) {
    currentSlide = index;
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    
    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');

    backBtn.style.display = currentSlide === 0 ? 'none' : 'block';

    if (currentSlide === totalSlides - 1) {
      nextBtn.textContent = 'Get Started';
    } else {
      nextBtn.textContent = 'Next';
    }
  }

  nextBtn.addEventListener('click', () => {
    if (currentSlide < totalSlides - 1) {
      updateSlide(currentSlide + 1);
    } else {
      dismissModal();
    }
  });

  backBtn.addEventListener('click', () => {
    if (currentSlide > 0) {
      updateSlide(currentSlide - 1);
    }
  });

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const index = parseInt(dot.getAttribute('data-index') || '0', 10);
      updateSlide(index);
    });
  });

  function dismissModal() {
    if (dontShowCheckbox.checked) {
      chrome.storage.local.set({ aegisWelcomeDismissed: true });
    }
    backdrop.remove();
  }

  closeBtn?.addEventListener('click', dismissModal);
}

// Load wishlist & config on startup
chrome.storage.local.get(['wishlistData', 'enhancedToNormal', 'scoringSource', 'lightggData', 'aegisSheetDb', 'perkRegistry', 'aegisLayoutSide', 'aegisDbMode', 'aegisTwoTier', 'aegisHoverEnabled', 'aegisArmorSource', 'aegisCompletedWeapons', 'aegisChaseList', 'aegisWelcomeDismissed'], (res) => {
  wishlistDb = res.wishlistData || {};
  enhancedToNormalMap = res.enhancedToNormal || {};
  completedWeapons = res.aegisCompletedWeapons || {};
  chaseList = res.aegisChaseList || {};
  scoringSource = res.scoringSource || 'aegis';
  aegisLayoutSide = res.aegisLayoutSide || 'side';
  aegisDbMode = res.aegisDbMode || 'both';
  aegisTwoTier = res.aegisTwoTier || false;
  aegisHoverEnabled = res.aegisHoverEnabled !== false;
  aegisArmorSource = res.aegisArmorSource || 'lowco';
  lightggDb = res.lightggData || {};
  aegisSheetDb = res.aegisSheetDb || null;
  if (clearLegacyDefaultChaseFilters()) {
    chrome.storage.local.set({ aegisChaseList: chaseList });
  }
  console.log(`DIM Aegis Overlay: Loaded configuration. Source: ${scoringSource}`);
  updateNameToHashFromWishlist();
  updatePerkNameToIcon(res.perkRegistry || {});
  updatePerkNameToHash(res.perkRegistry || {});
  reprocessAllElements();
  initAegisExplorer();

  if (!res.aegisWelcomeDismissed) {
    showWelcomeModal();
  }
});

// Watch for changes in storage (e.g. manual sync from settings popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    let changed = false;
    if (changes.wishlistData) {
      wishlistDb = changes.wishlistData.newValue || {};
      updateNameToHashFromWishlist();
      changed = true;
    }
    if (changes.enhancedToNormal) {
      enhancedToNormalMap = changes.enhancedToNormal.newValue || {};
      changed = true;
    }
    if (changes.scoringSource) {
      scoringSource = changes.scoringSource.newValue || 'aegis';
      changed = true;
    }
    if (changes.aegisLayoutSide) {
      aegisLayoutSide = changes.aegisLayoutSide.newValue || 'side';
      changed = true;
    }
    if (changes.aegisDbMode) {
      aegisDbMode = changes.aegisDbMode.newValue || 'both';
      changed = true;
    }
    if (changes.aegisTwoTier) {
      aegisTwoTier = changes.aegisTwoTier.newValue || false;
      changed = true;
    }
    if (changes.aegisHoverEnabled) {
      aegisHoverEnabled = changes.aegisHoverEnabled.newValue !== false;
      if (!aegisHoverEnabled) {
        if (tooltipShowTimer) {
          clearTimeout(tooltipShowTimer);
          tooltipShowTimer = null;
        }
        hoveredElement = null;
        hideTooltip();
      }
    }
    if (changes.aegisArmorSource) {
      aegisArmorSource = changes.aegisArmorSource.newValue || 'lowco';
      changed = true;
    }
    if (changes.lightggData) {
      lightggDb = changes.lightggData.newValue || {};
      changed = true;
    }
    if (changes.aegisSheetDb) {
      aegisSheetDb = changes.aegisSheetDb.newValue || null;
      if (clearLegacyDefaultChaseFilters()) {
        chrome.storage.local.set({ aegisChaseList: chaseList });
      }
      changed = true;
    }
    if (changes.perkRegistry) {
      updatePerkNameToIcon(changes.perkRegistry.newValue || {});
      updatePerkNameToHash(changes.perkRegistry.newValue || {});
      // NOTE: do NOT set changed=true here. The perk registry updates
      // constantly while scanning, and reprocessing all elements on every
      // registry write creates an expensive rescore feedback loop.
      // Registry changes only affect perk names/icons, not grades.
    }
    if (changes.aegisCompletedWeapons) {
      completedWeapons = changes.aegisCompletedWeapons.newValue || {};
      renderResults();
    }
    if (changes.aegisChaseList) {
      chaseList = changes.aegisChaseList.newValue || {};
      renderResults();
    }
    if (changed) {
      console.log('DIM Aegis Overlay: Storage updated, re-scoring elements.');
      reprocessAllElements();
    }
  }
});


// Track page scrolling so we can suppress tooltip builds while tiles are
// flying past under the cursor. Building the full tooltip (DOMParser HTML
// parse + forced layout for positioning) on every tile that passes under the
// mouse during a scroll is a major source of scroll jank, especially in Firefox.
let lastScrollTime = 0;
let scrollClassTimer: ReturnType<typeof setTimeout> | null = null;
document.addEventListener(
  'scroll',
  () => {
    lastScrollTime = Date.now();
    // Flag the document as "scrolling" so CSS can suppress hover transforms
    // on tiles passing under the cursor (each scale triggers a tile repaint)
    if (document.body && !document.body.classList.contains('aegis-scrolling')) {
      document.body.classList.add('aegis-scrolling');
    }
    if (scrollClassTimer) clearTimeout(scrollClassTimer);
    scrollClassTimer = setTimeout(() => {
      scrollClassTimer = null;
      document.body?.classList.remove('aegis-scrolling');
    }, 150);
  },
  { capture: true, passive: true }
);

let tooltipShowTimer: ReturnType<typeof setTimeout> | null = null;
const TOOLTIP_HOVER_DELAY_MS = 100;
const TOOLTIP_SCROLL_SUPPRESS_MS = 150;

function handleMouseEnter(e: MouseEvent) {
  if (!aegisHoverEnabled) return;

  const el = e.currentTarget as HTMLElement;
  hoveredElement = el;

  // Ignore hover hits that happen mid-scroll (tile just passed under cursor)
  if (Date.now() - lastScrollTime < TOOLTIP_SCROLL_SUPPRESS_MS) return;

  setupRegistryObserver();

  // Hover intent: only build the tooltip if the pointer actually settles
  if (tooltipShowTimer) {
    clearTimeout(tooltipShowTimer);
    tooltipShowTimer = null;
  }
  tooltipShowTimer = setTimeout(() => {
    tooltipShowTimer = null;
    if (hoveredElement !== el) return;

    const result = (el as any)._aegisResult as ScoringResult;
    const name = (el as any)._aegisName as string;
    const perksMap = (el as any)._aegisPerksMap as Record<number, { name: string; icon: string }>;
    const activeHashes = (el as any)._aegisActiveHashes as number[];

    if (result && result.grade) {
      const sheetWeapon = (el as any)._aegisSheetWeapon;
      const bestAlternative = (el as any)._aegisBestAlternative;
      const isBestInClass = (el as any)._aegisIsBestInClass;
      const sheetPerks = (el as any)._aegisSheetPerks;
      const sheetArmor = (el as any)._aegisSheetArmor;

      showTooltip(
        el,
        result,
        name,
        perksMap,
        activeHashes,
        scoringSource === 'lightgg',
        sheetWeapon,
        bestAlternative,
        isBestInClass,
        sheetPerks,
        perkNameToIcon,
        sheetArmor
      );
    }
  }, TOOLTIP_HOVER_DELAY_MS);
}

/**
 * Handles hiding the tooltip when the mouse leaves a weapon tile.
 */
function handleMouseLeave() {
  if (tooltipShowTimer) {
    clearTimeout(tooltipShowTimer);
    tooltipShowTimer = null;
  }
  hoveredElement = null;
  hideTooltip();
}

/**
 * Injects a detailed grade summary block into the DIM item popup header.
 */
function injectPopupSummary(
  popupContainer: HTMLElement,
  result: ScoringResult,
  scoringSource: string,
  sheetWeapon?: AegisSheetWeapon,
  sheetPerks?: { matched: TooltipPerk[]; missing: TooltipPerk[] },
  sheetArmor?: AegisArmorSet | null
) {
  const titleEl = popupContainer.querySelector('h1, [class*="title"]');
  if (!titleEl) return;

  const header = titleEl.parentElement;
  if (!header) return;

  // Cancel any pending details card injection timeouts
  if (activeDetailsTimeout) {
    clearTimeout(activeDetailsTimeout);
    activeDetailsTimeout = null;
  }

  // Clean up any previously injected details card
  popupContainer.querySelectorAll('[data-aegis-details="true"]').forEach((el) => el.remove());

  let summaryEl = popupContainer.querySelector('.aegis-popup-summary') as HTMLDivElement | null;
  if (!result.grade) {
    if (summaryEl) summaryEl.remove();
    return;
  }

  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.className = 'aegis-popup-summary';
    titleEl.insertAdjacentElement('afterend', summaryEl);
  }

  if (sheetArmor) {
    const val2 = getGradeValue(sheetArmor.piece2Rating);
    const val4 = getGradeValue(sheetArmor.piece4Rating);
    const betterRating = val2 >= val4 ? sheetArmor.piece2Rating : sheetArmor.piece4Rating;
    let baseGradeLetter = betterRating.toLowerCase().trim();
    if (baseGradeLetter.endsWith('+') || baseGradeLetter.endsWith('-')) {
      baseGradeLetter = baseGradeLetter.slice(0, -1);
    }
    const gradeClass = `aegis-badge-${baseGradeLetter}`;
    const wideClass = 'aegis-popup-grade-badge-wide';

    safeSetInnerHTML(
      summaryEl,
      `
      <div class="aegis-popup-summary-content">
        <div class="aegis-popup-row">
          <span class="aegis-popup-grade-badge ${gradeClass} ${wideClass}">${result.grade}</span>
          <span class="aegis-popup-label">Armor Set Bonus Ratings</span>
        </div>
      </div>
    `
    );

    // Inject armor detail card below sockets
    const sockets = popupContainer.querySelector('[class*="sockets" i], [class*="Sockets" i]');
    if (sockets) {
      const detailsCard = document.createElement('div');
      detailsCard.className = 'aegis-popup-details-card';
      detailsCard.setAttribute('data-aegis-details', 'true');

      safeSetInnerHTML(
        detailsCard,
        `
        <div class="aegis-popup-details-title">Armor Set Bonuses</div>
        
        <div class="aegis-armor-bonus-section">
          <div class="aegis-armor-bonus-header">
            <span class="aegis-armor-bonus-title">2-Piece Bonus: <strong>${sheetArmor.piece2Name}</strong></span>
            <span class="aegis-popup-grade-badge aegis-badge-${sheetArmor.piece2Rating.toLowerCase().replace(/[^a-z0-9]/g, '')}">${sheetArmor.piece2Rating}</span>
          </div>
          <div class="aegis-armor-bonus-desc">${sheetArmor.piece2Desc}</div>
          ${sheetArmor.piece2Numbers ? `<div class="aegis-armor-bonus-numbers"><strong>In-Depth:</strong> ${sheetArmor.piece2Numbers}</div>` : ''}
        </div>

        <div class="aegis-popup-meta-divider"></div>

        <div class="aegis-armor-bonus-section">
          <div class="aegis-armor-bonus-header">
            <span class="aegis-armor-bonus-title">4-Piece Bonus: <strong>${sheetArmor.piece4Name}</strong></span>
            <span class="aegis-popup-grade-badge aegis-badge-${sheetArmor.piece4Rating.toLowerCase().replace(/[^a-z0-9]/g, '')}">${sheetArmor.piece4Rating}</span>
          </div>
          <div class="aegis-armor-bonus-desc">${sheetArmor.piece4Desc}</div>
          ${sheetArmor.piece4Numbers ? `<div class="aegis-armor-bonus-numbers"><strong>In-Depth:</strong> ${sheetArmor.piece4Numbers}</div>` : ''}
        </div>

        <div class="aegis-popup-meta-divider"></div>

        <div class="aegis-popup-meta-content">
          <div class="aegis-popup-row" style="gap: 8px;">
            <span class="aegis-popup-meta-badge aegis-tier-source" style="background: linear-gradient(135deg, #1abc9c, #16a085) !important;">${sheetArmor.sourceType}</span>
            <span class="aegis-popup-meta-rank" style="color: #ccc;">Source: ${sheetArmor.source}</span>
          </div>
        </div>
      `
      );

      sockets.insertAdjacentElement('afterend', detailsCard);
    }
    return;
  }

  const baseGradeLetter = result.grade.charAt(0).toLowerCase();
  const gradeClass = `aegis-grade-${baseGradeLetter}`;
  const isLightGG = scoringSource === 'lightgg';

  let notesHtml = '';
  let showNotes = result.notes;
  if (sheetWeapon && showNotes === sheetWeapon.notes) {
    showNotes = '';
  }
  if (result.wishlistNotes) {
    showNotes = result.wishlistNotes;
  }

  if (showNotes) {
    const titleLabel = isLightGG && !result.wishlistNotes ? 'Information' : 'Wishlist Notes';
    notesHtml = `<div class="aegis-popup-notes-text"><strong>${titleLabel}:</strong> ${showNotes}</div>`;
  }

  let upgradeAdviceHtml = '';
  if (result.upgradeAdvice) {
    upgradeAdviceHtml = `
      <div class="aegis-popup-upgrade-banner">
        ${result.upgradeAdvice}
      </div>
    `;
  }

  const matchLabel = isLightGG
    ? 'Light.gg Roll Appraisal'
    : `Wishlist Match: <strong class="${gradeClass}">${result.matchPercentage}%</strong>`;

  // Look up Aegis Master spreadsheet metadata
  const weaponName = titleEl.querySelector('span')?.textContent?.trim() || titleEl.textContent?.trim() || '';

  let sheetMetaHtml = '';
  if (sheetWeapon) {
    const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
    const tierClass = `aegis-tier-${tierLetter}`;
    const rankLabel = sheetWeapon.rank ? `Rank #${sheetWeapon.rank} in Category` : '';

    sheetMetaHtml = `
      <div class="aegis-popup-meta-divider"></div>
      <div class="aegis-popup-meta-content">
        <div class="aegis-popup-row">
          <span class="aegis-popup-meta-badge ${tierClass}">${sheetWeapon.tier} Tier</span>
          ${rankLabel ? `<span class="aegis-popup-meta-rank">${rankLabel}</span>` : ''}
        </div>
        ${sheetWeapon.notes ? `<div class="aegis-popup-notes-text aegis-meta-notes"><strong>Aegis Meta:</strong> ${sheetWeapon.notes}</div>` : ''}
      </div>
    `;
  }

  const gradeStr = result.grade || '';
  const isTwoTier = gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-'));
  const popupBaseGradeLetter = isTwoTier 
    ? gradeStr.substring(1).charAt(0).toLowerCase() 
    : baseGradeLetter;
  const wideClass = isTwoTier ? 'aegis-popup-grade-badge-wide' : '';

  safeSetInnerHTML(
    summaryEl,
    `
    <div class="aegis-popup-summary-content">
      <div class="aegis-popup-row">
        <span class="aegis-popup-grade-badge aegis-badge-${popupBaseGradeLetter} ${wideClass}">${result.grade}</span>
        <span class="aegis-popup-label">${matchLabel}</span>
      </div>
      ${upgradeAdviceHtml}
      ${notesHtml}
    </div>
    ${sheetMetaHtml}
  `
  );

  // If we have sheet data, also inject detailed overview cards below perks grid
  if (sheetWeapon) {
    const categoryTab = findWeaponCategory(weaponName);
    const superiors = findSuperiors(categoryTab, sheetWeapon.energy, sheetWeapon.frame);

    // Find insertion target: Display perks button or sockets element
    const perksBtn = popupContainer.querySelector('button[title*="perks" i], button[title*="Perks" i]');
    const perksSection = perksBtn?.parentElement;
    const sockets = popupContainer.querySelector('[class*="sockets" i], [class*="Sockets" i]');
    const insertTarget = perksSection || sockets;

    if (insertTarget) {
      // Create a single unified details card
      const detailsCard = document.createElement('div');
      detailsCard.className = 'aegis-popup-details-card';
      detailsCard.setAttribute('data-aegis-details', 'true');

      let perksRowsHtml = '';
      const items = [
        { label: 'Barrel', type: 'barrel', rawVal: sheetWeapon.barrel },
        { label: 'Mag', type: 'mag', rawVal: sheetWeapon.mag },
        { label: 'Perk 1', type: 'perk1', rawVal: sheetWeapon.perk1 },
        { label: 'Perk 2', type: 'perk2', rawVal: sheetWeapon.perk2 },
        { label: 'Origin', type: 'origin', rawVal: sheetWeapon.origin },
      ];

      for (const item of items) {
        if (!item.rawVal) continue;
        
        let chipsHtml = '';
        if (sheetPerks) {
          const matched = sheetPerks.matched.filter(p => p.type === item.type);
          const missing = sheetPerks.missing.filter(p => p.type === item.type);

          for (const perk of matched) {
            const statusClass = perk.status === 'active' ? 'aegis-chip-active' : 'aegis-chip-selectable';
            const iconHtml = perk.icon ? `<img src="https://www.bungie.net${perk.icon}" class="aegis-chip-icon" />` : '';
            const statusLabel = perk.status === 'active' ? '' : ' (Selectable)';
            chipsHtml += `
              <span class="aegis-perk-chip ${statusClass}" title="${perk.name}${statusLabel}">
                ${iconHtml}
                <span class="aegis-chip-name">${perk.name}</span>
              </span>
            `;
          }

          for (const perk of missing) {
            const iconHtml = perk.icon ? `<img src="https://www.bungie.net${perk.icon}" class="aegis-chip-icon" />` : '';
            chipsHtml += `
              <span class="aegis-perk-chip aegis-chip-missing" title="${perk.name} (Missing)">
                ${iconHtml}
                <span class="aegis-chip-name">${perk.name}</span>
              </span>
            `;
          }
        }

        if (!chipsHtml) {
          const cleanVal = item.rawVal.split(/[\/\n]+/).map((s) => s.trim()).filter(Boolean).join(' / ');
          if (!cleanVal) continue;
          chipsHtml = `<span class="aegis-details-value-text">${cleanVal}</span>`;
        }

        perksRowsHtml += `
          <div class="aegis-details-row aegis-perk-row">
            <span class="aegis-details-label">${item.label}</span>
            <div class="aegis-details-value aegis-details-chips-container">
              ${chipsHtml}
            </div>
          </div>
        `;
      }

      // Check if superiors exist and format them
      let superiorsHtml = '';
      if (superiors.byEnergy || superiors.byFrame || superiors.byBoth) {
        const uniqueSups = new Map<string, { weapon: any; labels: string[] }>();
        const addUniqueSup = (label: string, supW: any) => {
          if (!supW) return;
          const key = supW.name.toLowerCase();
          if (uniqueSups.has(key)) {
            uniqueSups.get(key)!.labels.push(label);
          } else {
            uniqueSups.set(key, { weapon: supW, labels: [label] });
          }
        };

        if (sheetWeapon.energy) addUniqueSup(sheetWeapon.energy, superiors.byEnergy);
        if (sheetWeapon.frame) addUniqueSup(sheetWeapon.frame, superiors.byFrame);
        if (sheetWeapon.energy && sheetWeapon.frame) {
          addUniqueSup(`${sheetWeapon.energy} ${sheetWeapon.frame}`, superiors.byBoth);
        }

        let supRowsHtml = '';
        for (const item of uniqueSups.values()) {
          const isSelf = item.weapon.name.toLowerCase() === sheetWeapon.name.toLowerCase();
          const selfClass = isSelf ? 'aegis-sup-self' : '';
          const labelsStr = item.labels.join(' / ');
          
          const tierLetter = item.weapon.tier ? item.weapon.tier.charAt(0).toLowerCase() : '';
          const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${item.weapon.tier}</span>`;
          const rankHtml = item.weapon.rank ? `<span class="aegis-sup-rank-num">#${item.weapon.rank}</span>` : '';
          const currentLabel = isSelf ? '<span class="aegis-current-badge">(Current)</span>' : '';

          supRowsHtml += `
            <div class="aegis-details-row aegis-sup-row ${isSelf ? 'aegis-sup-row-self' : ''}">
              <span class="aegis-details-label aegis-sup-type-label" title="${labelsStr}">${labelsStr}</span>
              <span class="aegis-sup-name ${selfClass}">${item.weapon.name}${currentLabel}</span>
              <div class="aegis-sup-rank-group">
                ${tierBadgeHtml}
                ${rankHtml}
              </div>
            </div>
          `;
        }

        const currentWeaponKey = sheetWeapon.name.toLowerCase();
        if (!uniqueSups.has(currentWeaponKey)) {
          const tierLetter = sheetWeapon.tier ? sheetWeapon.tier.charAt(0).toLowerCase() : '';
          const tierBadgeHtml = `<span class="aegis-mini-tier-badge aegis-badge-${tierLetter}">${sheetWeapon.tier}</span>`;
          const rankHtml = sheetWeapon.rank ? `<span class="aegis-sup-rank-num">#${sheetWeapon.rank}</span>` : '';

          supRowsHtml += `
            <div class="aegis-details-row aegis-sup-row aegis-sup-row-self">
              <span class="aegis-details-label aegis-sup-type-label" title="Current Weapon">Current Weapon</span>
              <span class="aegis-sup-name aegis-sup-self">${sheetWeapon.name}<span class="aegis-current-badge">(Current)</span></span>
              <div class="aegis-sup-rank-group">
                ${tierBadgeHtml}
                ${rankHtml}
              </div>
            </div>
          `;
        }

        if (supRowsHtml) {
          superiorsHtml = `
            <div class="aegis-details-divider"></div>
            <div class="aegis-details-header" style="margin-top: 10px;">Best in Category (${categoryTab})</div>
            <div class="aegis-details-body">
              ${supRowsHtml}
            </div>
          `;
        }
      }

      if (perksRowsHtml || superiorsHtml) {
        safeSetInnerHTML(
          detailsCard,
          `
          <div class="aegis-details-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span>Aegis Recommended Perks</span>
            ${sheetWeapon.source ? `<span class="aegis-details-source-badge" style="font-size: 10px; font-weight: 500; color: #ffd700; background: rgba(255, 215, 0, 0.08); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.2); font-family: sans-serif; letter-spacing: 0.1px;">Source: ${sheetWeapon.source}</span>` : ''}
          </div>
          <div class="aegis-details-body aegis-perks-body" style="margin-bottom: ${superiorsHtml ? '10px' : '0'};">
            ${perksRowsHtml}
          </div>
          ${superiorsHtml}
        `
        );
        
        activeDetailsTimeout = setTimeout(() => {
          activeDetailsTimeout = null;
          const isSheet = popupContainer.matches('[class*="Sheet"], [class*="sheet"]');
          const rect = popupContainer.getBoundingClientRect();
          const spaceLeft = rect.left;
          const spaceRight = window.innerWidth - rect.right;

          if (aegisLayoutSide === 'side' && window.innerWidth >= 1000 && (isSheet || spaceLeft >= 330 || spaceRight >= 330)) {
            detailsCard.classList.add('aegis-side-panel');
            popupContainer.appendChild(detailsCard);
            
            detailsCard.style.setProperty('position', 'absolute', 'important');
            detailsCard.style.setProperty('top', '55px', 'important');
            
            if (isSheet || (spaceLeft >= spaceRight && spaceLeft >= 330)) {
              detailsCard.style.setProperty('left', '-320px', 'important');
              detailsCard.style.setProperty('right', 'auto', 'important');
            } else if (spaceRight >= 330) {
              detailsCard.style.setProperty('left', 'auto', 'important');
              detailsCard.style.setProperty('right', '-320px', 'important');
            } else {
              // Fallback to inline if neither side has enough space
              detailsCard.classList.remove('aegis-side-panel');
              detailsCard.style.removeProperty('position');
              detailsCard.style.removeProperty('top');
              detailsCard.style.removeProperty('left');
              detailsCard.style.removeProperty('right');
              insertTarget.after(detailsCard);
            }
          } else {
            detailsCard.classList.remove('aegis-side-panel');
            detailsCard.style.removeProperty('position');
            detailsCard.style.removeProperty('top');
            detailsCard.style.removeProperty('left');
            detailsCard.style.removeProperty('right');
            insertTarget.after(detailsCard);
          }
        }, 50);
      }
    }
  }
}

/**
 * Injects or updates the Aegis rank badge overlay inside a weapon tile.
 */
function injectBadge(el: HTMLElement, result: ScoringResult) {
  // Never inject badges inside popup toolbars, tag controls, or stat rows
  if (el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup') &&
      !el.matches('[id^="item-"], [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"], [class*="item-tile"], .item-tile, .item')) {
    removeBadge(el);
    return;
  }

  // Deduplicate: Find root item container to ensure EXACTLY 1 badge per item tile in DIM Stable and Beta
  const itemContainer = (el.closest('[data-aegis-item-hash]') as HTMLElement) || el;
  let badgeTarget = itemContainer.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"]') as HTMLElement | null;
  if (!badgeTarget) {
    badgeTarget = itemContainer;
  }
  // Ensure the badge target is relatively positioned so the absolute badge is anchored to it
  badgeTarget.style.setProperty('position', 'relative', 'important');

  // Handle S-tier gold glow class on the badge target
  if (result.grade && result.grade.startsWith('S')) {
    badgeTarget.classList.add('aegis-gold-glow');
  } else {
    badgeTarget.classList.remove('aegis-gold-glow');
  }

  // Purge any duplicate badges within itemContainer and reuse the primary badge
  const existingBadges = Array.from(itemContainer.querySelectorAll('.aegis-badge'));
  let badge: HTMLDivElement;

  if (existingBadges.length > 0) {
    badge = existingBadges[0] as HTMLDivElement;
    for (let i = 1; i < existingBadges.length; i++) {
      existingBadges[i].remove();
    }
  } else {
    badge = document.createElement('div');
    badge.className = 'aegis-badge';
    badgeTarget.appendChild(badge);
  }

  // Remove existing grade classes
  badge.className = 'aegis-badge';
  
  // Set grade class and text (normalizing S+ / A- etc. to the first letter class)
  const gradeStr = result.grade || '';
  const isTwoTier = gradeStr.length > 2 || (gradeStr.length === 2 && !gradeStr.endsWith('+') && !gradeStr.endsWith('-'));
  const isArmor = gradeStr.includes('/');
  
  let baseLetter = '';
  if (isArmor) {
    const parts = gradeStr.split('/');
    const val2 = getGradeValue(parts[0]);
    const val4 = getGradeValue(parts[1]);
    const betterRating = val2 >= val4 ? parts[0] : parts[1];
    baseLetter = betterRating.toLowerCase().trim();
    if (baseLetter.endsWith('+') || baseLetter.endsWith('-')) {
      baseLetter = baseLetter.slice(0, -1);
    }
  } else {
    // If it's a 2-tier grade (e.g. BS+ or SF), base color class on the actual roll matching grade (the last letter/symbol part)
    baseLetter = isTwoTier 
      ? gradeStr.substring(1).charAt(0).toLowerCase() 
      : (gradeStr ? gradeStr.charAt(0).toLowerCase() : '');
  }
    
  badge.classList.add(`aegis-badge-${baseLetter}`);
  if (isTwoTier || isArmor) {
    badge.classList.add('aegis-badge-wide');
  }
  badge.textContent = gradeStr;

  if (result.upgradeAvailable) {
    const upgradeArrow = document.createElement('span');
    upgradeArrow.className = 'aegis-badge-upgrade-arrow';
    upgradeArrow.textContent = '▲';
    badge.appendChild(upgradeArrow);
  }
}

/**
 * Removes the Aegis badge overlay from a weapon tile if it exists.
 */
function removeBadge(el: HTMLElement) {
  const itemContainer = (el.closest('[data-aegis-item-hash]') as HTMLElement) || el;
  itemContainer.classList.remove('aegis-gold-glow');
  const badgeTarget = itemContainer.querySelector('.item-tile, [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"]');
  if (badgeTarget) {
    badgeTarget.classList.remove('aegis-gold-glow');
  }
  itemContainer.querySelectorAll('.aegis-badge').forEach((b) => b.remove());
}

/**
 * Evaluates a single weapon tile element, calculates its grade, and applies overlay UI.
 */
function processElement(el: HTMLElement) {
  // If an ancestor is also annotated, this is a nested child element.
  // Skip it — the parent element handles badge injection for this item.
  // Do NOT call removeBadge here: the badge was injected INTO this element
  // by the parent's injectBadge() call, and removing it would destroy it.
  const parentWrapper = el.parentElement?.closest('[data-aegis-item-hash]');
  if (parentWrapper) {
    if (el.hasAttribute('data-aegis-listeners')) {
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeAttribute('data-aegis-listeners');
    }
    return;
  }


  const itemHashStr = el.getAttribute('data-aegis-item-hash');
  const weaponName = el.getAttribute('data-aegis-item-name') || 'Unknown Weapon';
  const perkHashesStr = el.getAttribute('data-aegis-perk-hashes');
  const perksDataStr = el.getAttribute('data-aegis-perks-data');

  if (itemHashStr && weaponName && weaponName !== 'Unknown Weapon') {
    const hash = parseInt(itemHashStr, 10);
    if (!isNaN(hash)) {
      const normName = weaponName.toLowerCase().trim();
      nameToHash[normName] = hash;
      const baseName = normName.replace(/\s*\([^)]+\)\s*$/, '').trim();
      nameToHash[baseName] = hash;
    }
  }

  const itemType = el.getAttribute('data-aegis-item-type') || 'weapon';

  if (itemType === 'armor') {
    if (!itemHashStr) return;
    try {
      const sheetArmor = findAegisArmorSet(weaponName);
      let result: ScoringResult;

      if (sheetArmor) {
        result = {
          grade: `${sheetArmor.piece2Rating}/${sheetArmor.piece4Rating}`,
          matchPercentage: 100,
          matchedPerks: [],
          missingPerks: [],
          notes: `2-Piece: ${sheetArmor.piece2Name} - ${sheetArmor.piece2Desc}\n4-Piece: ${sheetArmor.piece4Name} - ${sheetArmor.piece4Desc}`,
          wishlistPerks: [],
          wishlistNotes: `Source: ${sheetArmor.source} (${sheetArmor.sourceType})`,
        };
      } else {
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: '',
          wishlistPerks: [],
        };
      }

      (el as any)._aegisResult = result;
      (el as any)._aegisName = weaponName;
      (el as any)._aegisSheetArmor = sheetArmor;
      rememberScoredInstance(el, result);

      if (result.grade) {
        const isPopup = el.matches('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');

        if (!isPopup) {
          injectBadge(el, result);
        }

        const popupContainer = isPopup ? el : el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
        if (popupContainer) {
          injectPopupSummary(popupContainer as HTMLElement, result, scoringSource, undefined, undefined, sheetArmor);
        }

        if (!isPopup && !el.hasAttribute('data-aegis-listeners')) {
          el.addEventListener('mouseenter', handleMouseEnter);
          el.addEventListener('mouseleave', handleMouseLeave);
          el.setAttribute('data-aegis-listeners', 'true');
        }
      } else {
        removeBadge(el);
        const popupContainer = el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
        if (popupContainer) {
          const summary = popupContainer.querySelector('.aegis-popup-summary');
          if (summary) summary.remove();
        }
        if (el.hasAttribute('data-aegis-listeners')) {
          el.removeEventListener('mouseenter', handleMouseEnter);
          el.removeEventListener('mouseleave', handleMouseLeave);
          el.removeAttribute('data-aegis-listeners');
        }
      }
    } catch (err) {
      console.error('Error processing armor element in content script:', err);
    }
    return;
  }

  if (!itemHashStr || !perkHashesStr) {
    return;
  }

  try {
    const itemHash = parseInt(itemHashStr, 10);
    const perkHashes = perkHashesStr
      .split(',')
      .map((h) => parseInt(h.trim(), 10))
      .filter((h) => !isNaN(h));

    const instanceId = el.getAttribute('data-aegis-instance-id');

    let perksMap: Record<number, { name: string; icon: string }> = {};
    if (perksDataStr) {
      try { perksMap = JSON.parse(perksDataStr); } catch (e) { /* ignore */ }
      for (const p of Object.values(perksMap)) {
        if (p && p.name && p.icon) {
          const cleanName = cleanPerkName(p.name);
          perkNameToIcon[cleanName] = p.icon;
          perkNameToIcon[p.name.toLowerCase().trim()] = p.icon;
        }
      }
    }

    // Build perkNames from the perksDataMap (all hashes → names) for name-based matching fallback
    const perkNames = Object.values(perksMap)
      .map(p => p?.name?.toLowerCase().trim())
      .filter(Boolean) as string[];

    if (instanceId && weaponName && weaponName !== 'Unknown Weapon') {
      ownedItemsMap.set(instanceId, {
        instanceId,
        name: weaponName,
        hash: itemHash,
        perkHashes,
        perkNames,
      });
    }

    // Read the categorized possible perks written by the main world script (perk1s/perk2s separated by column)
    const possiblePerksAttr = el.getAttribute('data-aegis-weapon-possible-perks');
    if (possiblePerksAttr && weaponName && weaponName !== 'Unknown Weapon') {
      try {
        const possible = JSON.parse(possiblePerksAttr);
        const norm = weaponName.toLowerCase().trim();
        // Only update if we got real perk data (non-empty perk columns)
        if (possible && (possible.perk1s?.length > 0 || possible.perk2s?.length > 0 || possible.barrels?.length > 0)) {
          const existing = weaponPossiblePerksCache[norm];
          if (!existing || !existing.isFromManifest) {
            weaponPossiblePerksCache[norm] = possible;
          }
        }
      } catch (e) { /* ignore */ }
    }

    const activePerksDataStr = el.getAttribute('data-aegis-active-perk-hashes');
    let activeHashes: number[] = [];
    if (activePerksDataStr) {
      activeHashes = activePerksDataStr.split(',').map(Number).filter(h => !isNaN(h) && h > 0);
    }

    let result: ScoringResult;
    let sheetPerks = undefined;
    const elText = el.textContent || '';
    const sheetWeapon = findAegisWeapon(weaponName, perksMap, activeHashes, elText);
    let bestAlternative = undefined;
    let isBestInClass = false;

    if (scoringSource === 'lightgg') {
      const rawInstanceId = el.getAttribute('data-aegis-instance-id') || el.id.replace('item-', '');
      const instanceId = rawInstanceId.replace(/^[^0-9]+/, '');
      const grade = lightggDb[instanceId];
      if (grade) {
        let aegisResult: ScoringResult;
        const useSheet = sheetWeapon && aegisDbMode !== 'wishlist';
        const useWishlist = aegisDbMode !== 'spreadsheet';

        let wishlistResult: ScoringResult | null = null;
        if (useWishlist && wishlistDb && wishlistDb[itemHash]) {
          wishlistResult = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
        }

        if (useSheet) {
          const sheetScore = scoreSheetWeapon(sheetWeapon!, perksMap, activeHashes);
          aegisResult = sheetScore.result;
          sheetPerks = sheetScore.sheetPerks;
          aegisResult.upgradeAdvice = sheetScore.upgradeAdvice;
          aegisResult.potentialGrade = sheetScore.potentialGrade;
          if (wishlistResult && wishlistResult.grade) {
            aegisResult.wishlistNotes = wishlistResult.notes;
          }
        } else if (useWishlist && wishlistResult) {
          aegisResult = wishlistResult;
        } else {
          aegisResult = {
            grade: null,
            matchPercentage: 0,
            matchedPerks: [],
            missingPerks: [],
            notes: '',
            wishlistPerks: [],
          };
        }
        result = {
          grade: grade as any,
          matchPercentage: aegisResult.grade ? aegisResult.matchPercentage : 100,
          matchedPerks: aegisResult.matchedPerks,
          missingPerks: aegisResult.missingPerks,
          notes: aegisResult.notes || 'Community popularity rating from Light.gg Roll Appraiser.',
          wishlistPerks: aegisResult.wishlistPerks,
          upgradeAdvice: aegisResult.upgradeAdvice,
          potentialGrade: aegisResult.potentialGrade,
          wishlistNotes: aegisResult.wishlistNotes,
        };
      } else {
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: '',
          wishlistPerks: [],
        };
      }
    } else {
      const useSheet = sheetWeapon && aegisDbMode !== 'wishlist';
      const useWishlist = aegisDbMode !== 'spreadsheet';

      let wishlistResult: ScoringResult | null = null;
      if (useWishlist && wishlistDb && wishlistDb[itemHash]) {
        wishlistResult = scoreWeapon(itemHash, perkHashes, wishlistDb, enhancedToNormalMap);
      }

      if (useSheet) {
        const sheetScore = scoreSheetWeapon(sheetWeapon!, perksMap, activeHashes);
        result = sheetScore.result;
        sheetPerks = sheetScore.sheetPerks;
        result.upgradeAdvice = sheetScore.upgradeAdvice;
        result.potentialGrade = sheetScore.potentialGrade;
        if (wishlistResult && wishlistResult.grade) {
          result.wishlistNotes = wishlistResult.notes;
        }
      } else if (useWishlist && wishlistResult) {
        result = wishlistResult;
      } else {
        // Spreadsheet only mode but weapon is not in the spreadsheet
        result = {
          grade: null,
          matchPercentage: 0,
          matchedPerks: [],
          missingPerks: [],
          notes: '',
          wishlistPerks: [],
        };
      }
    }

    const hasSheetData = sheetWeapon && aegisDbMode !== 'wishlist';
    if (hasSheetData) {
      const categoryTab = findWeaponCategory(weaponName);
      const superiors = findSuperiors(categoryTab, sheetWeapon!.energy, sheetWeapon!.frame);
      const bestW = superiors.byBoth || superiors.byFrame || superiors.byEnergy;
      if (bestW) {
        if (bestW.name.toLowerCase() === sheetWeapon!.name.toLowerCase()) {
          isBestInClass = true;
        } else {
          bestAlternative = `${bestW.name} (${bestW.tier} #${bestW.rank})`;
        }
      }
    }

    // Attach data on the element object for hover events to retrieve
    (el as any)._aegisResult = result;
    rememberScoredInstance(el, result);
    (el as any)._aegisName = weaponName;
    (el as any)._aegisPerksMap = perksMap;
    (el as any)._aegisActiveHashes = activeHashes;
    (el as any)._aegisSheetWeapon = hasSheetData ? sheetWeapon : null;
    (el as any)._aegisBestAlternative = bestAlternative;
    (el as any)._aegisIsBestInClass = isBestInClass;
    (el as any)._aegisSheetPerks = hasSheetData ? sheetPerks : null;

    if (result.grade) {
      // Modify grade string to be 2-tier if configured and sheet data is present
      if (aegisTwoTier && hasSheetData && sheetWeapon && sheetWeapon.tier) {
        const archetypeTier = sheetWeapon.tier.trim();
        result.grade = `${archetypeTier}${result.grade}`;
      }

      const isPopup = el.matches('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      const isItemTile = el.matches('[id^="item-"], [class*="StoreItem"], [class*="InventoryItem"], [class*="ItemTile"], [class*="item-tile"], .item-tile, .item');

      // Inject rank badge (only if it's a valid item tile and NOT the popup container itself)
      if (!isPopup && isItemTile) {
        injectBadge(el, result);
      } else if (!isPopup) {
        removeBadge(el);
      }

      // Inject popup summary card if inside a details popup (or if we are the popup container)
      const popupContainer = isPopup ? el : el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      if (popupContainer) {
        injectPopupSummary(popupContainer as HTMLElement, result, scoringSource, sheetWeapon || undefined, sheetPerks);
      }

      // Attach event listeners for hover tooltips (only for valid item tiles)
      if (!isPopup && isItemTile && !el.hasAttribute('data-aegis-listeners')) {
        el.addEventListener('mouseenter', handleMouseEnter);
        el.addEventListener('mouseleave', handleMouseLeave);
        el.setAttribute('data-aegis-listeners', 'true');
      } else if (!isItemTile && el.hasAttribute('data-aegis-listeners')) {
        el.removeEventListener('mouseenter', handleMouseEnter);
        el.removeEventListener('mouseleave', handleMouseLeave);
        el.removeAttribute('data-aegis-listeners');
      }
    } else {
      // If graded previously but now has no grade, remove UI
      removeBadge(el);
      const popupContainer = el.closest('[class*="ItemPopup"], [class*="item-popup"], [class*="Sheet"], [class*="sheet"], .item-popup');
      if (popupContainer) {
        const summary = popupContainer.querySelector('.aegis-popup-summary');
        if (summary) summary.remove();
      }
      if (el.hasAttribute('data-aegis-listeners')) {
        el.removeEventListener('mouseenter', handleMouseEnter);
        el.removeEventListener('mouseleave', handleMouseLeave);
        el.removeAttribute('data-aegis-listeners');
      }
    }
  } catch (err) {
    console.error('Error processing element in content script:', err);
  }
}

/**
 * Every item this session has scored, keyed by its DIM instance id.
 *
 * The dimming preview can read `_aegisResult` straight off the tile, but the
 * native-query expansion cannot: applying a filter unmounts non-matching tiles
 * when DIM's "hide items that don't match" setting is on, taking their scores
 * with them. Stale entries for dismantled items are harmless — an `id:` term
 * for an item that no longer exists simply matches nothing.
 */
const scoredInstances = new Map<string, { hash: number; result: ScoringResult }>();

function rememberScoredInstance(el: HTMLElement, result: ScoringResult) {
  const instanceId = el.getAttribute('data-aegis-instance-id');
  if (!instanceId || instanceId === '0') return;
  const hash = parseInt(el.getAttribute('data-aegis-item-hash') || '', 10);
  if (isNaN(hash)) return;
  if (!scoredInstances.has(instanceId)) scheduleApplyBarRefresh();
  scoredInstances.set(instanceId, { hash, result });
}

const GRADE_VALUES: Record<string, number> = {
  's+': 9,
  's': 8,
  'a+': 7,
  'a': 6,
  'b+': 5,
  'b': 4,
  'c': 3,
  'd': 2,
  'f': 1,
  'none': 0
};

function compareGrades(itemGrade: string, queryStr: string): boolean {
  const normalizedGrade = itemGrade.toLowerCase().trim();
  const match = queryStr.match(/^([><]=?|==?)(.+)$/);
  
  if (match) {
    const op = match[1];
    const targetRank = match[2].trim();
    const valItem = GRADE_VALUES[normalizedGrade] ?? 0;
    const valTarget = GRADE_VALUES[targetRank] ?? 0;
    
    if (op === '>=') return valItem >= valTarget;
    if (op === '>') return valItem > valTarget;
    if (op === '<=') return valItem <= valTarget;
    if (op === '<') return valItem < valTarget;
    if (op === '=' || op === '==') return normalizedGrade === targetRank || normalizedGrade.startsWith(targetRank);
  }
  
  return normalizedGrade === queryStr || normalizedGrade.startsWith(queryStr);
}

/**
 * Decides whether a scored item satisfies a single `aegis:` query value
 * (the part after the colon, e.g. "w:>a", "a:2p:s", "god", "upgrade").
 *
 * Shared by the live dimming preview and by the native-query expansion, so
 * both always agree on what an aegis term means.
 */
function matchesAegisQuery(result: ScoringResult | undefined, targetQuery: string): boolean {
  const grade = result?.grade?.toLowerCase() || '';
  // Extract weapon rank and perk rank if it's a 2-tier grade (e.g. "bs+")
  let isMatch = false;
  const isArmor = grade.includes('/');

  if (isArmor) {
    let cleanQuery = targetQuery;
    if (targetQuery.startsWith('a:') || targetQuery.startsWith('armor:')) {
      cleanQuery = targetQuery.startsWith('a:') ? targetQuery.substring(2) : targetQuery.substring(6);
    }

    const parts = grade.split('/');
    const rating2 = parts[0];
    const rating4 = parts[1];

    if (cleanQuery.startsWith('2p:') || cleanQuery.startsWith('2piece:')) {
      const targetRank = cleanQuery.startsWith('2p:') ? cleanQuery.substring(3) : cleanQuery.substring(7);
      isMatch = compareGrades(rating2, targetRank);
    } else if (cleanQuery.startsWith('4p:') || cleanQuery.startsWith('4piece:')) {
      const targetRank = cleanQuery.startsWith('4p:') ? cleanQuery.substring(3) : cleanQuery.substring(7);
      isMatch = compareGrades(rating4, targetRank);
    } else if (cleanQuery.includes('/')) {
      isMatch = (grade === cleanQuery);
    } else {
      // General query matching either 2p or 4p rating
      isMatch = compareGrades(rating2, cleanQuery) || compareGrades(rating4, cleanQuery);
    }
  } else {
    // If the query starts with 'a:' or 'armor:', it's an armor-only filter, so weapons should not match.
    if (targetQuery.startsWith('a:') || targetQuery.startsWith('armor:')) {
      isMatch = false;
    } else {
      let weaponRank = '';
      let perkRank = '';
      const isTwoTier = grade.length > 2 || (grade.length === 2 && !grade.endsWith('+') && !grade.endsWith('-'));
      if (isTwoTier) {
        weaponRank = grade.charAt(0);
        perkRank = grade.substring(1);
      } else {
        perkRank = grade;
      }

      if (targetQuery === 'upgradeable' || targetQuery === 'upgradable' || targetQuery === 'upgrade') {
        isMatch = !!result?.upgradeAvailable;
      } else if (targetQuery === 'god') {
        isMatch = compareGrades(perkRank, '>=s');
      } else if (targetQuery.startsWith('w:') || targetQuery.startsWith('weapon:')) {
        const targetRank = targetQuery.startsWith('w:') ? targetQuery.substring(2) : targetQuery.substring(7);
        isMatch = compareGrades(weaponRank, targetRank);
      } else if (targetQuery.startsWith('p:') || targetQuery.startsWith('perk:')) {
        const targetRank = targetQuery.startsWith('p:') ? targetQuery.substring(2) : targetQuery.substring(5);
        isMatch = compareGrades(perkRank, targetRank);
      } else {
        // General match: combined grade, or weapon rank, or perk rank
        isMatch = compareGrades(grade, targetQuery) || compareGrades(weaponRank, targetQuery) || compareGrades(perkRank, targetQuery);
      }
    }
  }

  return isMatch;
}

// ── aegis: → native DIM query bridge ─────────────────────────────────────────
// `aegis:` terms are not real DIM filters, so DIM's own item count and the
// search-bar bulk actions (Tag as 'Favorite', Lock, Compare, …) never see them.
// The live dimming preview below stays as instant feedback, but the user can
// also "apply" an aegis query: every aegis token is spliced out of the query
// and replaced with an equivalent group of DIM's own `id:` / `hash:` filters,
// which the real filter pipeline understands.

interface AegisToken {
  start: number;
  end: number;
  query: string;
}

interface AegisExpansion {
  query: string;
  count: number;
}

// Matches an aegis term and its value, including the comparison operators.
const AEGIS_TOKEN_PATTERN = /\baegis:([a-z0-9+:<>=\/-]+)/gi;

// A freeform `id:` value no real item can have, used when a term matches
// nothing — an empty `()` group would be a parse error in DIM.
const AEGIS_NO_MATCH_TERM = 'id:aegis-no-match';

/** Finds every `aegis:` token in the raw (non-lowercased) query, with offsets. */
function findAegisTokens(raw: string): AegisToken[] {
  const tokens: AegisToken[] = [];
  AEGIS_TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = AEGIS_TOKEN_PATTERN.exec(raw)) !== null) {
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      query: match[1].toLowerCase(),
    });
  }
  return tokens;
}

/**
 * True when a query's verdict depends only on the item definition, so every
 * instance sharing an item hash necessarily agrees. Weapon archetype tiers and
 * armor set-bonus grades come from the sheet and are per-weapon; perk-roll
 * grades are per-instance and must never be collapsed to a `hash:` term.
 */
function isHashDeterministic(targetQuery: string): boolean {
  return /^(w|weapon|a|armor):/.test(targetQuery);
}

/**
 * Turns one aegis query value into the equivalent native DIM terms.
 *
 * For definition-level queries the matches collapse to one `hash:` term per
 * weapon instead of one `id:` per copy, which keeps a vault-wide query around a
 * kilobyte rather than several. Roll-level queries stay per-instance.
 */
function buildNativeTerms(targetQuery: string): { terms: string[]; ids: Set<string> } {
  const ids = new Set<string>();
  const byHash = new Map<number, { total: number; matched: string[] }>();

  scoredInstances.forEach((entry, instanceId) => {
    let bucket = byHash.get(entry.hash);
    if (!bucket) {
      bucket = { total: 0, matched: [] };
      byHash.set(entry.hash, bucket);
    }
    bucket.total++;
    if (matchesAegisQuery(entry.result, targetQuery)) {
      bucket.matched.push(instanceId);
      ids.add(instanceId);
    }
  });

  const collapsible = isHashDeterministic(targetQuery);
  const terms: string[] = [];
  byHash.forEach((bucket, hash) => {
    if (bucket.matched.length === 0) return;
    if (collapsible && bucket.matched.length === bucket.total) {
      terms.push(`hash:${hash}`);
    } else {
      for (const id of bucket.matched) {
        terms.push(`id:${id}`);
      }
    }
  });

  return { terms, ids };
}

/**
 * Rewrites a query containing `aegis:` terms into one DIM can evaluate itself.
 * Non-aegis terms are preserved verbatim, so `aegis:w:>a is:smg` still narrows
 * by weapon type. Returns null when there is nothing to expand.
 */
function expandAegisQuery(raw: string): AegisExpansion | null {
  const tokens = findAegisTokens(raw);
  if (tokens.length === 0) return null;

  let out = '';
  let cursor = 0;
  const perToken: Set<string>[] = [];

  for (const token of tokens) {
    const { terms, ids } = buildNativeTerms(token.query);
    perToken.push(ids);
    out += raw.slice(cursor, token.start);
    out += terms.length > 0 ? `(${terms.join(' or ')})` : AEGIS_NO_MATCH_TERM;
    cursor = token.end;
  }
  out += raw.slice(cursor);

  // Tokens are ANDed by DIM, so the count the user sees is the intersection.
  const matched = Array.from(perToken[0]).filter((id) => perToken.every((ids) => ids.has(id)));

  return { query: out.trim(), count: matched.length };
}

// The aegis text the user typed before applying, and the expansion we wrote
// into the search box. Both are cleared as soon as the box no longer holds
// that exact expansion (i.e. the user edited or cleared the search).
let appliedAegisSource: string | null = null;
let appliedAegisQuery: string | null = null;
let applyBarEl: HTMLElement | null = null;

function ensureApplyBar(): HTMLElement {
  if (applyBarEl && applyBarEl.isConnected) return applyBarEl;
  const bar = document.createElement('div');
  bar.className = 'aegis-apply-bar';
  bar.style.display = 'none';
  document.body.appendChild(bar);
  applyBarEl = bar;
  return bar;
}

function positionApplyBar(bar: HTMLElement, input: HTMLInputElement) {
  const rect = input.getBoundingClientRect();
  bar.style.left = `${Math.max(8, rect.left)}px`;
  bar.style.top = `${rect.bottom + 6}px`;
}

function applyAegisQuery(input: HTMLInputElement) {
  const source = input.value;
  const expansion = expandAegisQuery(source);
  if (!expansion) return;
  appliedAegisSource = source;
  appliedAegisQuery = expansion.query;
  setDimSearchValue(expansion.query);
  updateApplyBar();
}

function restoreAegisQuery() {
  if (appliedAegisSource === null) return;
  const source = appliedAegisSource;
  appliedAegisSource = null;
  appliedAegisQuery = null;
  setDimSearchValue(source);
  updateApplyBar();
}

/**
 * Recomputes the Apply / Applied control under DIM's search bar to match the
 * current query. Safe to call often — it is a no-op when nothing changed.
 */
function updateApplyBar() {
  const input = getDimSearchInput();
  if (!input) {
    if (applyBarEl) applyBarEl.style.display = 'none';
    return;
  }

  const raw = input.value;
  const isApplied = appliedAegisQuery !== null && raw.trim() === appliedAegisQuery.trim();
  if (!isApplied && appliedAegisQuery !== null) {
    // The user edited the box after applying — drop the applied state.
    appliedAegisSource = null;
    appliedAegisQuery = null;
  }

  const bar = ensureApplyBar();

  if (isApplied) {
    const label = appliedAegisSource || '';
    bar.innerHTML = `
      <span class="aegis-apply-chip">
        <span class="aegis-apply-chip-label">Applied</span>
        <code class="aegis-apply-chip-query"></code>
        <button type="button" class="aegis-apply-restore" title="Restore the aegis query">&times;</button>
      </span>`;
    const queryEl = bar.querySelector('.aegis-apply-chip-query');
    if (queryEl) queryEl.textContent = label;
    bar.querySelector('.aegis-apply-restore')?.addEventListener('click', restoreAegisQuery);
    bar.style.display = 'flex';
    positionApplyBar(bar, input);
    return;
  }

  const expansion = expandAegisQuery(raw);
  if (!expansion) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  bar.innerHTML = `
    <button type="button" class="aegis-apply-btn" title="Rewrite this into a native DIM query so the item count and bulk tagging work">
      Apply to DIM <span class="aegis-apply-count">${expansion.count}</span>
    </button>`;
  bar.querySelector('.aegis-apply-btn')?.addEventListener('click', () => applyAegisQuery(input));
  bar.style.display = 'flex';
  positionApplyBar(bar, input);
}

// New items are scored asynchronously as DIM renders them, so a count shown
// moments after typing can be stale. Refresh on a short debounce instead.
let applyBarRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleApplyBarRefresh() {
  if (applyBarRefreshTimer) return;
  applyBarRefreshTimer = setTimeout(() => {
    applyBarRefreshTimer = null;
    updateApplyBar();
  }, 400);
}

window.addEventListener('resize', () => updateApplyBar());
window.addEventListener('scroll', () => {
  // Fires constantly while scrolling the inventory, so bail before touching the
  // DOM in the overwhelmingly common case where the bar isn't even showing.
  if (!applyBarEl || applyBarEl.style.display === 'none') return;
  const input = getDimSearchInput();
  if (input) positionApplyBar(applyBarEl, input);
}, true);

function setupSearchFilterObserver() {
  const searchInput = getDimSearchInput();
  if (!searchInput) return;

  if (searchInput.hasAttribute('data-aegis-search-observer')) return;
  searchInput.setAttribute('data-aegis-search-observer', 'true');

  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim().toLowerCase();

    // Check if search query has "aegis:grade" (allowing comparison operators > < = /)
    const tokens = findAegisTokens(val);

    if (tokens.length > 0) {
      const items = document.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
      items.forEach(item => {
        const result = (item as any)._aegisResult as ScoringResult | undefined;
        const isMatch = tokens.every((token) => matchesAegisQuery(result, token.query));

        if (isMatch) {
          item.style.setProperty('opacity', '1', 'important');
          item.style.setProperty('filter', 'none', 'important');
        } else {
          item.style.setProperty('opacity', '0.15', 'important');
          item.style.setProperty('filter', 'grayscale(80%)', 'important');
        }
      });
    } else {
      // Restore all items
      const items = document.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
      items.forEach(item => {
        item.style.removeProperty('opacity');
        item.style.removeProperty('filter');
      });
    }

    updateApplyBar();
  });

  updateApplyBar();
}

/**
 * Scans the page DOM for annotated item elements and processes them.
 */
function reprocessAllElements() {
  setupRegistryObserver();
  setupSearchFilterObserver();
  const elements = document.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
  for (let i = 0; i < elements.length; i++) {
    processElement(elements[i]);
  }
}

// 1. Observe the DOM for additions or changes to 'data-aegis-item-hash' or 'data-aegis-perk-hashes'
// Mutations are batched and processed once per animation frame instead of
// running processElement + opacity sync for every single mutation record.
const pendingProcessTargets = new Set<HTMLElement>();
let processFlushScheduled = false;

function flushPendingProcessTargets() {
  processFlushScheduled = false;
  setupRegistryObserver();
  setupSearchFilterObserver();
  const targets = Array.from(pendingProcessTargets);
  pendingProcessTargets.clear();
  for (let i = 0; i < targets.length; i++) {
    if (targets[i].isConnected) {
      processElement(targets[i]);
    }
  }
  scheduleOpacityUpdate();
}

const observer = new MutationObserver((mutations) => {
  for (let i = 0; i < mutations.length; i++) {
    const mutation = mutations[i];

    // Check if the custom data attributes were modified
    if (
      mutation.type === 'attributes' &&
      (mutation.attributeName === 'data-aegis-item-hash' || mutation.attributeName === 'data-aegis-perk-hashes')
    ) {
      pendingProcessTargets.add(mutation.target as HTMLElement);
    }

    // Check for added nodes that might contain our attributes
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.hasAttribute('data-aegis-item-hash')) {
            pendingProcessTargets.add(node);
          }
          // Scan children
          const children = node.querySelectorAll<HTMLElement>('[data-aegis-item-hash]');
          children.forEach((child) => pendingProcessTargets.add(child));
        }
      });
    }
  }
  if (pendingProcessTargets.size > 0 && !processFlushScheduled) {
    processFlushScheduled = true;
    requestAnimationFrame(flushPendingProcessTargets);
  }
});

function startObserver() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    return;
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-aegis-item-hash', 'data-aegis-perk-hashes'],
  });
}
startObserver();

function getItemContainer(badge: HTMLElement): HTMLElement | null {
  const parent = badge.parentElement;
  if (!parent) return null;


  // Case A: The parent itself is the item container
  if (parent.hasAttribute('data-aegis-item-hash')) {
    return parent;
  }

  // Case B: The item container is a sibling inside the parent (e.g. parent is .item-drag-container)
  const siblingContainer = parent.querySelector('[data-aegis-item-hash]');
  if (siblingContainer) {
    return siblingContainer as HTMLElement;
  }

  // Case C: The item container is an ancestor of parent
  const ancestorContainer = parent.closest('[data-aegis-item-hash]');
  if (ancestorContainer) {
    return ancestorContainer as HTMLElement;
  }

  return null;
}

function updateBadgesOpacity() {
  const badges = document.querySelectorAll<HTMLElement>('.aegis-badge');

  badges.forEach((badge) => {
    const parent = badge.parentElement;
    if (!parent) return;

    let isDimmed = false;

    // 1. Walk up from parent to document.body (detect parent card dimming)
    let currentAncestor: HTMLElement | null = parent;
    while (currentAncestor && currentAncestor !== document.body) {
      const style = window.getComputedStyle(currentAncestor);
      const opacity = parseFloat(style.opacity || '1');
      const filter = style.filter || '';

      if (opacity < 0.9 || filter.includes('opacity') || filter.includes('grayscale')) {
        isDimmed = true;
        break;
      }
      currentAncestor = currentAncestor.parentElement;
    }

    // 2. Find the item container and check its direct children
    if (!isDimmed) {
      const container = getItemContainer(badge);
      if (container) {
        // A. Check container itself
        const containerStyle = window.getComputedStyle(container);
        const containerOpacity = parseFloat(containerStyle.opacity || '1');
        const containerFilter = containerStyle.filter || '';
        if (containerOpacity < 0.9 || containerFilter.includes('opacity') || containerFilter.includes('grayscale')) {
          isDimmed = true;
        }

        // B. Check direct children of the container (e.g. the .item wrapper)
        if (!isDimmed) {
          const children = container.children;
          for (let i = 0; i < children.length; i++) {
            const child = children[i] as HTMLElement;
            if (child.classList.contains('aegis-badge')) continue;
            const style = window.getComputedStyle(child);
            const opacity = parseFloat(style.opacity || '1');
            const filter = style.filter || '';

            if (opacity < 0.9 || filter.includes('opacity') || filter.includes('grayscale')) {
              isDimmed = true;
              break;
            }
          }
        }
      }
    }

    // Apply or remove style overrides accordingly (skip DOM writes when the
    // state didn't change — each setProperty call forces a style recalc)
    const newState = isDimmed ? '1' : '0';
    if (badge.dataset.aegisDimmed === newState) return;
    badge.dataset.aegisDimmed = newState;
    if (isDimmed) {
      badge.style.setProperty('opacity', '0.25', 'important');
      badge.style.setProperty('filter', 'grayscale(0.8)', 'important');
    } else {
      badge.style.removeProperty('opacity');
      badge.style.removeProperty('filter');
    }
  });
}

// Run initial scan once script loads
reprocessAllElements();
updateBadgesOpacity();
setupRegistryObserver();

// Keep badge opacity in sync with React state updates — event-driven, not polled.
// DIM dims items by mutating class/style attributes, so watch for those changes
// near annotated items and recompute once per frame when they occur.
let opacityUpdateScheduled = false;

function scheduleOpacityUpdate() {
  if (opacityUpdateScheduled) return;
  opacityUpdateScheduled = true;
  const tryRun = () => {
    // Defer while the page is actively scrolling: the badge dim state is not
    // perceivable mid-scroll, and running the getComputedStyle walk over every
    // badge each frame is expensive (13%+ of main thread in Firefox profiles).
    if (Date.now() - lastScrollTime < TOOLTIP_SCROLL_SUPPRESS_MS) {
      setTimeout(tryRun, 150);
      return;
    }
    opacityUpdateScheduled = false;
    updateBadgesOpacity();
  };
  tryRun();
}

const dimmingObserver = new MutationObserver((mutations) => {
  for (let i = 0; i < mutations.length; i++) {
    const target = mutations[i].target as HTMLElement;
    // Ignore our own badge style writes
    if (target.classList && target.classList.contains('aegis-badge')) continue;
    // Only care about changes on or around annotated item containers
    if (
      target.closest('[data-aegis-item-hash]') ||
      (target.querySelector && target.querySelector('.aegis-badge'))
    ) {
      scheduleOpacityUpdate();
      return;
    }
  }
});

function startDimmingObserver() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startDimmingObserver, { once: true });
    return;
  }
  dimmingObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'style'],
    subtree: true,
  });
}
startDimmingObserver();

// Diagnostic logging framework
const diagnosticLogs: string[] = [];

function addDiagnosticLog(msg: string) {
  console.log(`[Aegis Diagnostic] ${msg}`);
  const time = new Date().toTimeString().split(' ')[0];
  const formatted = `[${time}] ${msg}`;
  diagnosticLogs.push(formatted);
  const content = document.querySelector('.aegis-diagnostic-logs-content');
  if (content) {
    content.textContent += `${formatted}\n`;
    content.scrollTop = content.scrollHeight;
  }
}

// Receive logs from main world context
document.addEventListener('aegis-diagnostic-log', (e: any) => {
  if (e.detail) {
    addDiagnosticLog(e.detail);
  }
});

// Setup initial log entry
addDiagnosticLog('Aegis isolated-world script initialized.');

