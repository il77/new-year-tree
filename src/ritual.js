// Ритуал первого входа (story 1.3): машина состояний dark → falling → revealed
// и чистые функции прогресса, детерминированные по времени t (мс).
// Без DOM и глобалов: localStorage подаётся объектом-аргументом, вся обвязка —
// в src/main.js. Тестируется на node:test без браузера.

import { SPARK_POSITION } from './spark.js';

/** Фаза: первый вход, темнота, ждём касания. */
export const PHASE_DARK = 'dark';
/** Фаза: ритуал идёт — искра падает, мир проявляется. */
export const PHASE_FALLING = 'falling';
/** Фаза: мир проявился полностью. */
export const PHASE_REVEALED = 'revealed';

/** Ключ флага первого входа в localStorage (читает story 1.4). */
export const FIRST_VISIT_KEY = 'ny_tree_first_visit';
/** Значение флага: пропуск ритуала — только при точном совпадении. */
export const FIRST_VISIT_VALUE = '1';

/**
 * Тайминг ритуала в мс (зафиксировано в плане story-ritual-plan.md):
 * падение искры 800 мс; мир проявляется слоями с задержками,
 * ёлка «дозревает» на RITUAL_TOTAL = treeDelay + layerFade ≈ 2.05 с.
 */
export const RITUAL_TIMING = {
  /** Падение искры от центра-выше до земли. */
  fall: 800,
  /** Задержка проявления снега от старта ритуала. */
  snowDelay: 200,
  /** Задержка проявления леса. */
  forestDelay: 650,
  /** Задержка проявления ёлки — самая поздняя, мир «дозревает» целиком. */
  treeDelay: 1100,
  /** Длительность плавного проявления одного слоя. */
  layerFade: 950,
};

/** Полная длительность ритуала: конец проявления последнего слоя (ёлка). */
export const RITUAL_TOTAL = RITUAL_TIMING.treeDelay + RITUAL_TIMING.layerFade;

/** Доля высоты, куда падает искра (снежная земля у основания ёлки). */
export const SPARK_FALL_TO_RATIO = 0.78;
/** Доля времени падения, с которой искра начинает гаснуть. */
const SPARK_FADE_PORTION = 0.3;

/** Кламп в [0, 1]. */
function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Smoothstep: плавное S-образное проявление слоя (мягко на старте и в конце,
 * без линейной «шаговости» — ощущение праздничного проступания).
 *
 * @param {number} p значение уже клампнутое в [0, 1]
 * @returns {number}
 */
function smoothstep(p) {
  return p * p * (3 - 2 * p);
}

/**
 * Чистый старт ритуала: dark → falling. Из любой другой фазы — no-op
 * (повторные касания идемпотентны).
 *
 * @param {{ phase: string, startedAt: number | null }} state текущее состояние
 * @param {number} t время старта в мс
 * @returns {object} новое состояние (или то же самое, если старт невозможен)
 */
export function startRitual(state, t) {
  if (state.phase !== PHASE_DARK) return state;
  return { phase: PHASE_FALLING, startedAt: t };
}

/**
 * Чистый шаг машины состояний: falling → revealed, когда прошло
 * RITUAL_TOTAL мс. Из revealed/dark — no-op.
 *
 * @param {{ phase: string, startedAt: number | null }} state текущее состояние
 * @param {number} t текущее время в мс
 * @returns {object} новое состояние (или то же самое)
 */
export function updateRitual(state, t) {
  if (state.phase !== PHASE_FALLING) return state;
  if (t - state.startedAt >= RITUAL_TOTAL) {
    return { phase: PHASE_REVEALED, startedAt: state.startedAt };
  }
  return state;
}

/**
 * Чистый прогресс кадра: из состояния и времени t — всё, что нужно рендеру.
 * Детерминирован (одинаковые аргументы → глубоко одинаковый результат),
 * состояние не мутирует; время до старта клампится в 0 (кадр во время
 * ритуала с t < startedAt не «откатывает» мир).
 *
 * @param {{ phase: string, startedAt: number | null }} state состояние машины
 * @param {number} t время кадра в мс
 * @returns {{
 *   phase: string,
 *   spark: { yRatio: number, alpha: number },
 *   layers: { snow: number, forest: number, tree: number },
 * }} позиция/альфа искры долями экрана и непрозрачность слоёв мира 0..1
 */
export function ritualProgress(state, t) {
  if (state.phase === PHASE_REVEALED) {
    return {
      phase: PHASE_REVEALED,
      spark: { yRatio: SPARK_FALL_TO_RATIO, alpha: 0 },
      layers: { snow: 1, forest: 1, tree: 1 },
    };
  }

  if (state.phase !== PHASE_FALLING || state.startedAt === null) {
    // Темнота: искра на своём месте, мира ещё нет.
    return {
      phase: PHASE_DARK,
      spark: { yRatio: SPARK_POSITION.yRatio, alpha: 1 },
      layers: { snow: 0, forest: 0, tree: 0 },
    };
  }

  const elapsed = Math.max(0, t - state.startedAt);

  // Падение: позиция ease-in (квадрат — ощущение свободного падения),
  // альфа — линейный фейд в последние 30% времени падения.
  const fall = clamp01(elapsed / RITUAL_TIMING.fall);
  const fallEased = fall * fall;
  const alpha =
    fall >= 1 - SPARK_FADE_PORTION
      ? clamp01((1 - fall) / SPARK_FADE_PORTION)
      : 1;

  const layerAt = (delay) =>
    smoothstep(clamp01((elapsed - delay) / RITUAL_TIMING.layerFade));

  return {
    phase: PHASE_FALLING,
    spark: {
      yRatio:
        SPARK_POSITION.yRatio +
        (SPARK_FALL_TO_RATIO - SPARK_POSITION.yRatio) * fallEased,
      alpha,
    },
    layers: {
      snow: layerAt(RITUAL_TIMING.snowDelay),
      forest: layerAt(RITUAL_TIMING.forestDelay),
      tree: layerAt(RITUAL_TIMING.treeDelay),
    },
  };
}

/**
 * Фабрика контроллера ритуала: тонкий мутабельный холдер поверх чистых
 * функций (состояние — в замыкании, как в createSceneContract/bootstrap:
 * тесты создают изолированные экземпляры, глобального состояния нет).
 *
 * @param {{ firstVisit?: boolean }} [options] firstVisit — прочитанный флаг:
 *   true → фаза revealed с самого начала (ритуал не играется)
 * @returns {{
 *   readonly phase: string,
 *   readonly startedAt: number | null,
 *   touch: (t: number) => boolean,
 *   update: (t: number) => string,
 *   progress: (t: number) => object,
 *   finish: () => void,
 * }}
 */
export function createRitual({ firstVisit = false } = {}) {
  let state = firstVisit
    ? { phase: PHASE_REVEALED, startedAt: 0 }
    : { phase: PHASE_DARK, startedAt: null };

  return {
    get phase() {
      return state.phase;
    },
    get startedAt() {
      return state.startedAt;
    },

    /** Касание: запускает ритуал из dark. true — ритуал только что стартовал. */
    touch(t) {
      const next = startRitual(state, t);
      const started = next !== state;
      state = next;
      return started;
    },

    /** Шаг по времени; возвращает фазу после шага. */
    update(t) {
      state = updateRitual(state, t);
      return state.phase;
    },

    /** Прогресс кадра (чистый вызов ritualProgress для текущего состояния). */
    progress(t) {
      return ritualProgress(state, t);
    },

    /**
     * Дожать ритуал до конца сразу — деградация для окружений без
     * requestAnimationFrame: мир проявляется мгновенно, без анимации.
     */
    finish() {
      if (state.phase === PHASE_FALLING) {
        state = { phase: PHASE_REVEALED, startedAt: state.startedAt };
      }
    },
  };
}

/**
 * Читает флаг первого входа. Любая ошибка (приватный режим, запрет
 * хранилища, битые данные) и любое значение ≠ "1" — это «первого входа ещё
 * не было»: ритуал играется каждый раз.
 *
 * Обоснование ветки ошибки (см. Design Notes плана): ритуал короткий, тихий
 * и ненавязчивый — его повторность безвредна, а потеря порог-сотворения
 * (R9) убрала бы ядро концепции. Обратная ветка (ошибка = «пройдено»)
 * показала бы миру без ритуала именно там, где с браузером что-то не так.
 *
 * @param {Storage | null | undefined} storage хранилище (может бросать)
 * @returns {boolean} true — ритуал уже сыгран, его не играем
 */
export function readFirstVisit(storage) {
  try {
    return Boolean(storage) && storage.getItem(FIRST_VISIT_KEY) === FIRST_VISIT_VALUE;
  } catch {
    return false;
  }
}

/**
 * Ставит флаг первого входа. Ошибки (приватный режим) проглатываются:
 * несостоявшаяся запись не должна ломать ритуал — в следующий раз он просто
 * сыграется заново (см. обоснование в readFirstVisit).
 *
 * @param {Storage | null | undefined} storage хранилище (может бросать)
 * @returns {void}
 */
export function writeFirstVisit(storage) {
  try {
    if (storage) storage.setItem(FIRST_VISIT_KEY, FIRST_VISIT_VALUE);
  } catch {
    // Ничего: деградация — «первый вход» каждый раз, UX от этого не страдает.
  }
}
