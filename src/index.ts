import { create, StateCreator } from 'zustand';
import { shallow } from 'zustand/shallow';
import mapValues from 'lodash/mapValues';
import { useCreation } from 'ahooks';

type StateSetter<S> = (partial: Partial<S> | ((state: S) => Partial<S>)) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Action<S, Args extends any[] = any[]> = (state: S, ...args: Args) => void;
export type Actions<S> = {
  [action: string]: Action<S>;
};

type ArrayRest<T> = T extends [unknown, ...infer Rest] ? Rest : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtraParameters<F extends (...args: any[]) => any> = ArrayRest<Parameters<F>>;
export type DispatchActions<S, AS extends Actions<S>> = {
  [P in keyof AS]: (...args: ExtraParameters<AS[P]>) => void;
};

/**
 * @example
 * type State = { n: number };
 * const model = {
 *  state: { n: 0 },
 *  actions: (set) => ({
 *    increment(state, by: number) {
 *      set({ n: state.n + by});
 *    },
 *    async asyncIncrement(_, by: number) {
 *      await sleep();
 *      set(state => ({ n: state.n + by}));
 *    }
 *  })
 * } satisfies Model<State>;
 */
export type Model<S, AS extends Actions<S> = Actions<S>> = {
  state: S;
  actions: (setState: StateSetter<S>) => AS;
};
export type DispatchModel<S, AS extends Actions<S> = Actions<S>> = {
  state: S;
  actions: DispatchActions<S, AS>;
};

type ZustandArgs<S, AS extends Actions<S> = Actions<S>> = Parameters<
  StateCreator<DispatchModel<S, AS>>
>;
const zustandAdaptor =
  <S, AS extends Actions<S> = Actions<S>>(model: Model<S, AS>) =>
  (set: ZustandArgs<S, AS>[0], get: ZustandArgs<S, AS>[1], _api: ZustandArgs<S, AS>[2]) => {
    const { state, actions } = model;
    // Notice the shape of state
    const setState: StateSetter<S> = (updater) => {
      set((all) => {
        const partial = updater instanceof Function ? updater(all.state) : updater;
        return { state: { ...all.state, ...partial } }; // zustand only supports auto-merging the first level
      });
    };
    const adaptedActions: DispatchActions<S, AS> = mapValues(
      actions(setState),
      (action) =>
        (...args) =>
          action(get().state, ...args)
    );
    return {
      state,
      actions: adaptedActions,
    };
  };

type ModelHook<S, AS extends Actions<S> = Actions<S>> = <U = S>(
  selector?: ((s: S) => U) | undefined
) => [U, DispatchActions<S, AS>];

/**
 * Put any middleware here if needed
 */
export const createModel = <S, AS extends Actions<S> = Actions<S>>(
  model: Model<S, AS>
): ModelHook<S, AS> => {
  const useZustandHook = create(zustandAdaptor(model));
  return (selector) => {
    // annoying hook rules and stupid type inference!
    // the following code aims to express:
    // const { state, actions } = selector ?
    //      useZustandHook(({ state, actions }) => ({ state: selector(state), actions }), shallow)
    //    : useZustandHook();
    const args: Parameters<typeof useZustandHook> = selector
      ? [({ state, actions }) => ({ state: selector(state), actions }), shallow]
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ([] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { state, actions } = useZustandHook(...args) as any;
    return [state, actions];
  };
};

export const useModel = <S, AS extends Actions<S> = Actions<S>, U = S>(
  model: Model<S, AS>,
  selector?: ((state: S) => U) | undefined
) => {
  const useGivenModel = useCreation(() => createModel(model), []);
  return useGivenModel(selector);
};