// Контракт рендера сцены — общий интерфейс для эпиков 2–4 (гирлянда,
// календарь, мир). Объект подписывается на кадр и получает ctx/размер/время.
// Состояние регистрации живёт в замыкании фабрики (как bootstrap(doc, win)):
// тесты создают изолированный экземпляр, страница — общий sceneContract.
// Без зависимостей: только чистый JS.

/** Слой по умолчанию: объекты без явного слоя идут сразу после искры. */
export const DEFAULT_LAYER = 0;

/**
 * @callback SceneObjectDraw
 * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
 * @param {number} width текущая ширина кадра (canvas)
 * @param {number} height текущая высота кадра (canvas)
 * @param {number} t время в мс; 0 — статичный кадр
 * @returns {void}
 */

/**
 * Создаёт изолированный контракт регистрации объектов сцены.
 *
 * @returns {{
 *   register: (draw: SceneObjectDraw, options?: { layer?: number }) => void,
 *   draw: (ctx: CanvasRenderingContext2D, width: number, height: number, t: number) => void,
 *   readonly size: number,
 * }}
 */
export function createSceneContract() {
  const entries = [];
  let nextSeq = 0;
  let ordered = [];

  return {
    /**
     * Регистрирует объект сцены. Вызывается один раз на этапе загрузки
     * модуля; объект появится на ближайшем кадре (первый кадр bootstrap
     * уже увидит его, если модуль импортирован до bootstrap).
     *
     * @param {SceneObjectDraw} draw функция отрисовки объекта
     * @param {{ layer?: number }} [options] слой: чем меньше — тем раньше
     *   (после фона и искры); при равенстве — порядок регистрации
     * @returns {void}
     * @throws {TypeError} если draw — не функция, options — не объект
     *   (в том числе null) или layer — не конечное число;
     *   ничего при этом не регистрируется
     */
    register(draw, options = {}) {
      if (typeof draw !== 'function') {
        throw new TypeError(
          `register: нужна draw-функция (ctx, width, height, t), получено: ${typeof draw}`,
        );
      }
      if (options === null || typeof options !== 'object') {
        throw new TypeError(
          `register: options должен быть объектом { layer }, получено: ${options === null ? 'null' : typeof options}`,
        );
      }
      const { layer = DEFAULT_LAYER } = options;
      if (typeof layer !== 'number' || !Number.isFinite(layer)) {
        throw new TypeError(
          `register: layer должен быть конечным числом, получено: ${String(layer)}`,
        );
      }
      entries.push({ layer, seq: nextSeq, draw });
      nextSeq += 1;
      // Стабильный порядок: по возрастанию слоя, при равенстве — порядок
      // регистрации (seq не даёт sort перетасовывать элементы одного слоя).
      ordered = [...entries].sort((a, b) => a.layer - b.layer || a.seq - b.seq);
    },

    /**
     * Отрисовывает все зарегистрированные объекты в порядке слоёв.
     * Вызывается renderFrame после фона и искры.
     *
     * @param {CanvasRenderingContext2D} ctx 2D-контекст (в тесте — мок)
     * @param {number} width текущая ширина кадра
     * @param {number} height текущая высота кадра
     * @param {number} t время в мс
     * @returns {void}
     */
    draw(ctx, width, height, t) {
      for (const entry of ordered) {
        entry.draw(ctx, width, height, t);
      }
    },

    /** Количество зарегистрированных объектов (для тестов и отладки). */
    get size() {
      return entries.length;
    },
  };
}

// Общий экземпляр страницы: эпик 2–4 импортирует его и регистрирует объекты
// на уровне модуля — к первому кадру bootstrap они уже в списке.
// В тестах используйте createSceneContract() и передавайте экземпляр
// в bootstrap/renderFrame, чтобы не делить состояние с другими тестами.
export const sceneContract = createSceneContract();
