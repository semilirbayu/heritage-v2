import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { branchMarkOrigin, branchTargets } from '../../layout/branchAffordance';
import { layoutFamilyView } from '../../layout/layoutFamilyView';
import { cardSubtext } from '../../layout/cardText';
import { type GenerationDepth } from '../../layout/constants';
import { nextRootTrail } from './rootTrail';
import { isGhostCard, primaryLayoutCard, shownPersonCount, type LayoutCard } from '../../layout/types';
import { getHomePerson } from '../../model/helpers';
import type { FamilyTree, Person } from '../../model/types';
import { bindWindowDrag } from './drag';
import { isTextEntryTarget } from './keyboard';
import {
  DEFAULT_SCALE,
  PAN_STEP,
  SCALE_STEP,
  centerCard,
  fitBounds,
  isCardInView,
  shiftView,
  zoomAt,
  type Camera,
} from './camera';
import PersonCard from './PersonCard';
import ProfilePanel, { Chevron } from './ProfilePanel';
import { Avatar } from './silhouettes';

const GENERATIONS: Array<{ value: GenerationDepth; label: string }> = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 'all', label: '5+' },
];

const CULL_MARGIN = 500;

interface FamilyViewProps {
  tree: FamilyTree;
  warnings: string[];
  onOpenAnother: () => void;
}

export default function FamilyView({ tree, warnings, onOpenAnother }: FamilyViewProps): ReactElement {
  const home = getHomePerson(tree);
  const homeId = home?.id ?? '';

  const [rootId, setRootId] = useState(homeId);
  const [rootTrail, setRootTrail] = useState<string[]>(homeId ? [homeId] : []);
  const [selectedId, setSelectedId] = useState(homeId);
  const [panelOpen, setPanelOpen] = useState(false);
  const [generations, setGenerations] = useState<GenerationDepth>('all');
  const [cousins, setCousins] = useState(true);
  const [camera, setCamera] = useState<Camera>({ scale: DEFAULT_SCALE, tx: 0, ty: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [view, setView] = useState({ width: 0, height: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, camera });
  const suppressClick = useRef(false);
  const wheelAccum = useRef(0);
  const framed = useRef(false);
  const cameraRef = useRef(camera);
  const frameRef = useRef(0);
  const mountedRef = useRef(true);
  const dragCleanup = useRef<(() => void) | null>(null);

  function moveCamera(next: Camera, animated: boolean): void {
    cancelAnimationFrame(frameRef.current);
    const from = cameraRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const same = from.tx === next.tx && from.ty === next.ty && from.scale === next.scale;
    if (!animated || reduce || same) {
      cameraRef.current = next;
      setCamera(next);
      return;
    }

    // CSS transitions on an SVG <g> never finish in Chromium, so the camera
    // is eased here. ease-out cubic, 500ms.
    const start = performance.now();
    const tick = (now: number): void => {
      if (!mountedRef.current) return;
      const t = Math.min(1, (now - start) / 500);
      const eased = 1 - (1 - t) ** 3;
      const current: Camera = {
        scale: from.scale + (next.scale - from.scale) * eased,
        tx: from.tx + (next.tx - from.tx) * eased,
        ty: from.ty + (next.ty - from.ty) * eased,
      };
      cameraRef.current = current;
      setCamera(current);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }

  const moveCameraRef = useRef(moveCamera);
  moveCameraRef.current = moveCamera;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(frameRef.current);
      dragCleanup.current?.();
      dragCleanup.current = null;
    };
  }, []);

  const layout = useMemo(
    () => (rootId ? layoutFamilyView(tree, rootId, { generations, cousins }) : { cards: [], connectors: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
    [tree, rootId, generations, cousins],
  );

  const peopleById = tree.people;
  const selected = peopleById.get(selectedId);
  const directory = useMemo(
    () => [...tree.people.values()].sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id)),
    [tree],
  );
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = needle
      ? directory.filter((person) => person.displayName.toLowerCase().includes(needle))
      : directory;
    return source.slice(0, 12);
  }, [directory, query]);

  function centerOn(id: string, animated: boolean, panel = panelOpen): void {
    const stage = stageRef.current;
    const card = primaryLayoutCard(layout.cards, id);
    if (!stage || !card || stage.clientWidth === 0) return;
    moveCamera(
      {
        scale: cameraRef.current.scale,
        ...centerCard(card, { width: stage.clientWidth, height: stage.clientHeight }, cameraRef.current.scale, panel),
      },
      animated,
    );
  }

  const centerOnRef = useRef(centerOn);
  centerOnRef.current = centerOn;

  function selectCard(id: string): void {
    if (suppressClick.current) return;
    if (id === selectedId) {
      setPanelOpen(true);
      centerOn(id, true, true);
      return;
    }
    setSelectedId(id);
    centerOn(id, true);
  }

  const selectRef = useRef(selectCard);
  selectRef.current = selectCard;
  const onCardSelect = useCallback((id: string) => {
    selectRef.current(id);
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = (): void => {
      setView((current) =>
        current.width === stage.clientWidth && current.height === stage.clientHeight
          ? current
          : { width: stage.clientWidth, height: stage.clientHeight },
      );
      if (!framed.current && stage.clientWidth > 0 && stage.clientHeight > 0) {
        framed.current = true;
        centerOnRef.current(rootId, false, false);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [rootId]);

  const viewKey = `${rootId}|${generations}|${cousins}`;
  const seenView = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (seenView.current === viewKey) return;
    const first = seenView.current === null;
    seenView.current = viewKey;
    if (!first) centerOnRef.current(rootId, false, panelOpen);
  }, [viewKey, rootId, panelOpen]);

  useEffect(() => {
    if (selectedId && !layout.cards.some((card) => card.personId === selectedId)) {
      setSelectedId(rootId);
    }
  }, [layout.cards, selectedId, rootId]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      wheelAccum.current += event.deltaY;
      if (Math.abs(wheelAccum.current) < 40) return;
      const direction = wheelAccum.current > 0 ? -1 : 1;
      wheelAccum.current = 0;
      const rect = stage.getBoundingClientRect();
      const anchorX = event.clientX - rect.left;
      const anchorY = event.clientY - rect.top;
      const current = cameraRef.current;
      moveCameraRef.current(zoomAt(current, anchorX, anchorY, current.scale + direction * SCALE_STEP), false);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || isTextEntryTarget(event.target)) return;
      if (event.key === 'Escape') {
        if (menuOpen) setMenuOpen(false);
        else if (panelOpen) {
          setPanelOpen(false);
          centerOnRef.current(selectedId, true, false);
        }
        return;
      }
      const step: Record<string, [number, number] | undefined> = {
        ArrowLeft: [-PAN_STEP, 0],
        ArrowRight: [PAN_STEP, 0],
        ArrowUp: [0, -PAN_STEP],
        ArrowDown: [0, PAN_STEP],
      };
      const delta = step[event.key];
      if (!delta) return;
      event.preventDefault();
      const [viewDx, viewDy] = delta;
      moveCameraRef.current(shiftView(cameraRef.current, viewDx, viewDy), false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, panelOpen, selectedId]);

  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (searchOpen && searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen, searchOpen]);

  function reRoot(id: string): void {
    setSelectedId(id);
    setRootTrail((trail) => nextRootTrail(trail.length > 0 ? trail : homeId ? [homeId] : [], id));
    if (id === rootId) {
      centerOn(id, true, panelOpen);
      return;
    }
    setRootId(id);
  }

  function focusPerson(id: string): void {
    setQuery('');
    setSearchOpen(false);
    setSelectedId(id);
    if (layout.cards.some((card) => card.personId === id)) {
      centerOn(id, true);
      return;
    }
    reRoot(id);
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.button !== 0) return;
    // Pointer capture would retarget the click onto the <svg>, so a card
    // never sees it. Window listeners keep the gesture without stealing it.
    suppressClick.current = false;
    cancelAnimationFrame(frameRef.current);
    const drag = { active: true, moved: false, x: event.clientX, y: event.clientY, camera: cameraRef.current };
    dragRef.current = drag;

    const onMove = (ev: PointerEvent): void => {
      if (!drag.active || !mountedRef.current) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      const stage = stageRef.current;
      const threshold = Math.max(4, (stage?.clientWidth ?? 0) * 0.01);
      if (!drag.moved && Math.hypot(dx, dy) < threshold) return;
      drag.moved = true;
      const next = { ...drag.camera, tx: drag.camera.tx + dx, ty: drag.camera.ty + dy };
      cameraRef.current = next;
      setCamera(next);
    };

    const onUp = (): void => {
      // Swallow only the click this drag produces. Children that stop
      // pointerdown (the branch pill) never reset the flag, so clear it after
      // this event turn instead of waiting for the next canvas press.
      if (drag.moved) {
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      drag.active = false;
      dragCleanup.current?.();
      dragCleanup.current = null;
    };

    dragCleanup.current?.();
    dragCleanup.current = bindWindowDrag(window, { move: onMove, up: onUp });
  }

  function onCanvasClickCapture(event: ReactMouseEvent<SVGSVGElement>): void {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  }

  function zoomBy(direction: 1 | -1): void {
    const stage = stageRef.current;
    if (!stage) return;
    const panel = panelOpen ? 370 : 0;
    const anchorX = panel + (stage.clientWidth - panel) / 2;
    const anchorY = stage.clientHeight / 2;
    moveCamera(zoomAt(cameraRef.current, anchorX, anchorY, cameraRef.current.scale + direction * SCALE_STEP), false);
  }

  function fit(): void {
    const stage = stageRef.current;
    if (!stage || layout.cards.length === 0) return;
    moveCamera(fitBounds(layout.bounds, { width: stage.clientWidth, height: stage.clientHeight }, panelOpen), false);
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      setSearchOpen(true);
      setHighlight((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setHighlight((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const person = results[highlight] ?? results[0];
      if (person) focusPerson(person.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setSearchOpen(false);
    }
  }

  const generationLabel = GENERATIONS.find((choice) => choice.value === generations)?.label ?? '5+';
  const visibleCards = layout.cards.filter(
    (card) => card.personId === selectedId || isCardInView(card, camera, view, CULL_MARGIN),
  );
  const visibleIds = new Set(visibleCards.map((card) => card.personId));
  const branchMarks = useMemo(() => placeBranchMarks(tree, layout.cards), [tree, layout.cards]);

  function openBranch(personId: string): void {
    reRoot(personId);
  }

  if (!home) {
    return (
      <div className="family">
        <p className="family-empty">This file has no people to show.</p>
      </div>
    );
  }

  return (
    <div className="family">
      <header className="app-header">
        <div className="app-header__titles">
          <span className="app-header__tree-name">{tree.sourceName ?? 'Family tree'}</span>
          <span className="app-header__separator" aria-hidden="true">
            |
          </span>
          <nav className="app-header__trail" aria-label="Family branch">
            {rootTrail.map((id, index) => {
              const name = peopleById.get(id)?.displayName ?? '';
              const current = index === rootTrail.length - 1;
              return (
                <span key={id} className="app-header__crumb">
                  {index > 0 ? (
                    <span className="app-header__crumb-sep" aria-hidden="true">
                      {' › '}
                    </span>
                  ) : null}
                  {current ? (
                    <span className="app-header__home">{name}</span>
                  ) : (
                    <button type="button" className="app-header__crumb-link" onClick={() => reRoot(id)}>
                      {name}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        </div>
        <div className="family-header__actions">
          <button type="button" className="family-header__back" onClick={onOpenAnother}>
            Open another file
          </button>
          <span className="app-header__tab">Family view</span>
        </div>
      </header>

      <div className={panelOpen ? 'family-stage is-panel' : 'family-stage'}>
        <div className="family-toolbar">
          <div className="family-toolbar__left">
            <button
              type="button"
              className="icon-button"
              aria-label={panelOpen ? 'Close profile' : 'Open profile'}
              aria-expanded={panelOpen}
              onClick={() => {
                if (panelOpen) {
                  setPanelOpen(false);
                  centerOn(selectedId, true, false);
                } else {
                  setPanelOpen(true);
                  centerOn(selectedId || rootId, true, true);
                }
              }}
            >
              <Chevron direction={panelOpen ? 'left' : 'right'} />
            </button>
            <p className="family-toolbar__count">
              {shownPersonCount(layout.cards)} of {tree.people.size} people
            </p>
            {warnings.length > 0 && (
              <details className="family-warnings">
                <summary>
                  {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
                </summary>
                <ul>
                  {warnings.map((warning, index) => (
                    <li key={`${index}-${warning}`}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="family-toolbar__right">
            <div className="generations" ref={menuRef}>
              <button
                type="button"
                className="generations__button"
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                aria-label={`Generations above/below main person, currently ${generationLabel}`}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {generationLabel}
                <span className="generations__caret" aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="generations__menu" role="dialog" aria-label="Generations above/below main person">
                  <p className="generations__label">Generations above/below main person</p>
                  <div className="generations__choices" role="radiogroup" aria-label="Generations">
                    {GENERATIONS.map((choice) => (
                      <button
                        key={choice.label}
                        type="button"
                        role="radio"
                        aria-checked={choice.value === generations}
                        className={choice.value === generations ? 'generations__choice is-active' : 'generations__choice'}
                        onClick={() => {
                          setGenerations(choice.value);
                          setMenuOpen(false);
                        }}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                  <label className="generations__cousins">
                    <input type="checkbox" checked={cousins} onChange={(event) => setCousins(event.target.checked)} />
                    Show cousins of main person
                  </label>
                </div>
              )}
            </div>

            <div className="person-search" ref={searchRef}>
              <input
                className="person-search__input"
                type="text"
                role="combobox"
                aria-label="Find a person"
                aria-expanded={searchOpen}
                aria-controls="person-search-list"
                aria-autocomplete="list"
                placeholder="Find a person…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={onSearchKeyDown}
              />
              {searchOpen && (
                <ul className="person-search__list" id="person-search-list" role="listbox">
                  {results.length === 0 ? (
                    <li className="person-search__empty">No matches</li>
                  ) : (
                    results.map((person, index) => (
                      <li key={person.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === highlight}
                          className={index === highlight ? 'person-search__option is-active' : 'person-search__option'}
                          onMouseEnter={() => setHighlight(index)}
                          onClick={() => focusPerson(person.id)}
                        >
                          <Avatar person={person} size={28} />
                          <span>
                            <span className="person-search__name">{person.displayName}</span>
                            <SearchMeta person={person} />
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="family-canvas-wrap" ref={stageRef}>
        <svg
          className="family-canvas"
          role="application"
          aria-label="Family tree"
          onPointerDown={onPointerDown}
          onClickCapture={onCanvasClickCapture}
        >
          <defs>
            <filter id="card-select-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000" floodOpacity="0.2" />
            </filter>
          </defs>
          <g
            className="family-canvas__world"
            style={{ transform: `translate(${camera.tx}px, ${camera.ty}px) scale(${camera.scale})` }}
          >
            {layout.connectors.map((connector) => (
              <path key={connector.familyId} className="connector" d={connector.d} />
            ))}
            {visibleCards.map((card) => {
              const person = peopleById.get(card.personId);
              if (!person) return null;
              const ghost = isGhostCard(card);
              return (
                <PersonCard
                  key={card.instanceId ?? card.personId}
                  person={person}
                  instanceId={card.instanceId ?? card.personId}
                  x={card.x}
                  y={card.y}
                  ghost={ghost}
                  copyCount={card.copyCount}
                  selected={!ghost && card.personId === selectedId}
                  onSelect={onCardSelect}
                />
              );
            })}
            {branchMarks.map((mark) =>
              visibleIds.has(mark.personId) ? (
                <BranchMark
                  key={mark.key}
                  x={mark.x}
                  y={mark.y}
                  name={mark.name}
                  onOpen={() => openBranch(mark.personId)}
                />
              ) : null,
            )}
          </g>
        </svg>

        <div className="zoom-stack">
          <button type="button" className="zoom-stack__button" aria-label="Fit tree" onClick={fit}>
            <FitIcon />
          </button>
          <button
            type="button"
            className="zoom-stack__button"
            aria-label="Re-centre on main person"
            onClick={() => {
              setSelectedId(rootId);
              centerOn(rootId, true);
            }}
          >
            <HomeIcon />
          </button>
          <button type="button" className="zoom-stack__button" aria-label="Zoom in" onClick={() => zoomBy(1)}>
            +
          </button>
          <button type="button" className="zoom-stack__button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
            −
          </button>
          <p className="zoom-stack__label">{Math.round(camera.scale * 100)}%</p>
        </div>
        </div>

        {selected && (
          <ProfilePanel
            tree={tree}
            person={selected}
            home={home}
            open={panelOpen}
            onClose={() => {
              setPanelOpen(false);
              centerOn(selected.id, true, false);
            }}
            onFocusPerson={focusPerson}
            onViewTree={(id) => {
              reRoot(id);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface BranchMarkLayout {
  key: string;
  personId: string;
  name: string;
  x: number;
  y: number;
}

function placeBranchMarks(tree: FamilyTree, cards: LayoutCard[]): BranchMarkLayout[] {
  const shown = new Set(cards.map((card) => card.personId));
  const byId = new Map<string, LayoutCard>();
  for (const card of cards) {
    const current = byId.get(card.personId);
    if (!current || (isGhostCard(current) && !isGhostCard(card))) byId.set(card.personId, card);
  }
  const marks: BranchMarkLayout[] = [];

  for (const target of branchTargets(tree, shown)) {
    const person = tree.people.get(target.personId);
    const card = byId.get(target.personId);
    if (!person || !card) continue;
    const origin = branchMarkOrigin(card.x, card.y);
    marks.push({
      key: target.personId,
      personId: target.personId,
      name: person.displayName,
      x: origin.x,
      y: origin.y,
    });
  }

  return marks;
}

function BranchMark({
  x,
  y,
  name,
  onOpen,
}: {
  x: number;
  y: number;
  name: string;
  onOpen: () => void;
}): ReactElement {
  function onKeyDown(event: ReactKeyboardEvent<SVGGElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onOpen();
  }

  return (
    <g
      className="branch-mark"
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label="View family branch"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={onKeyDown}
    >
      <title>{`View family branch of ${name}`}</title>
      <rect x={-2} y={-2} width={54} height={22} fill="transparent" />
      <rect className="branch-mark__pill" width={20} height={12} rx={4} fill="rgb(40, 63, 102)" />
      <rect className="branch-mark__pill" x={30} width={20} height={12} rx={4} fill="rgb(40, 63, 102)" />
      <path
        d="M19.5 6.5h11 M25.5 6.5v15.5"
        fill="none"
        stroke="rgb(40, 63, 102)"
        strokeOpacity={0.5}
        strokeWidth={1}
      />
    </g>
  );
}

function SearchMeta({ person }: { person: Person }): ReactElement | null {
  const label = cardSubtext(person);
  if (!label) return null;
  return <span className="person-search__meta">{label}</span>;
}

function FitIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 7.2 8 3l5 4.2V13H9.5V9.5h-3V13H3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
