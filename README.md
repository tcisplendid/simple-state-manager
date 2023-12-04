# A simple state manager
Redux is too much for a carefree life. Zustand is new and simple, but its interface is too simple to help conceptual thinking and design. A Rematch-like interface might be familiar to people who use Redux-style state management. This package is an example for a simple state manager mixed with Rematch(good conceptual understanding) and Zustand(good usability) styles to achieve usage like the following:
```
type State = { n: number };
const model = {
 state: { n: 0 },
 actions: (set) => ({
   increment(state, by: number) {
     set({ n: state.n + by});
   },
   async asyncIncrement(_, by: number) {
     await sleep();
     set(state => ({ n: state.n + by}));
   }
 })
} satisfies Model<State>;
```


## Principles
1. An ongoing application should consIDer carefully what intrusive libraries it will depend on, if it wants to stay updated with new technologies. My experience is that application outlives library, just like data outlives code. Especially in front-end world, new stuff keeps emerging. A layer of abstraction is essentially necessary for any intrusive third-party library unless there are higher priority consIDeration. 

2. An interface need not be perfect for any library to adapt. It just needs to be easy to understand and to implement. The implementation should also be minimal. According to C.A.R. Hoare's saying:
> There are two ways of constructing a software design: One way is to make it so simple that there are obviously no deficiencies, and the other way is to make it so complicated that there are no obvious deficiencies. 

3. It's OK not to be type-strict. Type serves as smart document and smaller-than-unit test. However it might harm readability sometimes. We can compensate unstrict type with real documents and real tests.

4. Ignore performance until it matters, according to Sir Hoare again:
> Premature optimization is the root of all evil.


## Interface design
### Async function
It's annoying to handle asynchrounous functions. I can't agree on Redux and Elm's opinion about pure-function-only model. In class, synchrounous methods are no different from asynchrounous methods. Model is in a layer of application, where code should be organized around bussiness logic only but not be forced to write in a way the implementation detail requires, which violates Dependency Inversion Principle directly.

However, we can't just have asynchrounous reducer like `const newState = await reducer(state, action)`, because passed `state` argument may be changed before the promise resolves.


#### Option 1: this
```
const model = {
    state: {
        state1: 1,
        state2: undefined
    },
    actions: {
        increment(by) {
            this.state1 += by
        },
        async incrementAsync(by) {
            await sleep(10);
            this.state1 += by
        }
    }
}
```

It's quite like Vue's [Pinia](https://pinia.vuejs.org/core-concepts/):
```
export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0, name: 'Eduardo' }),
  getters: {
    doubleCount: (state) => state.count * 2,
  },
  actions: {
    increment() {
      this.count++
    },
  },
})
```

`this` unifies state modification in both synchronous and asynchrous functions, because `this` only modifies partial state and immeIDiatly takes effect after the statement, unlike reducer modifies the whole state when returns. 
It can also easily call other models' actions.

However, it may cause problems easily:
* Must forbIDe arrow functions.
* Can't destructe action without `bind(this)`.
* Can't copy a model after `bind(this)`.
* Can't use a proxy after copying.


#### Option 2: setState
```
const model = {
    state: {
        state1: 1,
        state2: undefined
    },
    actions: (setState) => ({
        increment(state, by) {
            setState({ state1: state.state.1 + by })
        },
        async incrementAsync(state, by) {
            await sleep(10);
            setState(state => { state1: state.state.1 + by })
        }
    })
}
```

Hardly accepted. Not simple as `this`.


#### Option 3: return
```
const model = {
    state: {
        state1: 1,
        state2: undefined
    },
    actions: {
        increment(state, by) {
            return { state1: state.state.1 + by }
        },
        async incrementAsync(state, by) {
            await sleep(10);
            return { state1: state.state.1 + by }
        }
    }
}
```
It's more similar to reducer, better in abstraction. Yet `return` requires an asynchronous action can't setState multiple times. It also takes more work to overrIDe the whole state correctly.


#### Comparison
* `this` is best in usability but hard to implement due to language features.
* `setState` is good at semantics and extendsibility. A `setState` is like an action (or a `dispatch`), which just does something without returning anything. It can be called multiple times in the same action.
* Reducer is the semantics of an incomplete state machine (while XState is complete). Returning new state is a a bit incompatible to asynchronous handling (dispatching events). 

Therefore we choose `setState`.


### query, getter, computed, selector
The simplest form of state management can exist without such concepts, using only the 'state' overall. However, from a CQRS perspective, an action corresponds to a command and a state corresponds to many queries. However, if a query relies solely on raw state, it won't be able to handle complex requirements. Therefore, various state mangement will find ways to supplement the functionality of query-like operations.

There are semantic differences among terms like query, getter, computed, and selector:
* Getter: Has a more general meaning.
* Computed: Automatically computes, regardless of whether it's used or not.
* Selector: Retrieves a subset of the state. Use the selector function as needed.
* Query: Derives state. It's a function and can take parameters.

Generally, queries are synchronous, such as getters in Pinia or selectors in Zustand. It seems unnecessary for us to make queries asynchronous. If there's a need for asynchronous date, use it as a parameter in the query.

```
const model = {
    state: {
        state1: 1,
        state2: undefined
    },
    actions: (setState) => ({
        increment(state, by) {
            setState({ state1: state.state.1 + by })
        },
        async incrementAsync(state, by) {
            await sleep(10);
            setState({ state1: state.state.1 + by })
        }
    }),
    getters: {
        doubledState1: (state) => state.state1 * 2
    },
}
```

For now, let's not consIDer queries within the model layer, because:
* If it's not automatically computed, the query in the model layer only stores some static functions. It can be written in any way without a library. For example, they can be put to a `utils` file.
* If it's computed:
    * The difference between computed and selector will make it more difficult in distinguishing responsibilities. For instance, one may need to require global selectors to be written as computed to avoID redundant computations, while model-specific selectors are used on-demand in the view layer.
    * `computed` requires a fair amount of additional adaptation work. Zustand itself lacks a similar concept.


## Usage
### Single view
#### A simple way
```
import { ExampleModel } from 'model';
import useModel from 'useModel';

const [state, actions] = useModel(ExampleModel, selector);
```


#### `createModel`
```
import { ExampleModel } from 'model';
import createModel from 'useModel';

const useExampleModel = createModel(ExampleModel);

const [state, actions] = useExampleModel(selector);
```

### Singleton across multiple views
#### Communication through `Context`
```
// Parent.tsx
import { ExampleModel } from 'model';
import useModel from 'useModel';

export const ExampleContext = React.createContext(null);

const model = useModel(ExampleModel, selector);
<ExampleContext.ProvIDer value={model} >
</ExampleContext.ProvIDer>

// Child.tsx
import { ExampleContext } from 'Parent';

const [state, actions] = useContext(ExampleContext);
```

#### `createModel` return a hook
`createModel` returns a hook which is a singleton instance of store. The same hook refers to the same instance, while multiple `createModel` creates multiple instances.
```
// page1.tsx
import { ExampleModel } from 'model';
import createModel from 'useModel';

export const useExampleModel = createModel(ExampleModel);

const [state, actions] = useExampleModel(selector);

// page2.tsx
import { useExampleModel } from 'page1';
const [state, actions] = useExampleModel(selector);
```

#### Define with ID
Define an ID with an ID. Any instance can be achieved with its ID.
```
// page1.tsx
import { ExampleModel } from 'model';
import useModel from 'useModel';

const [state, actions] = useModel(ExampleModel, 'example', selector);

// page2.tsx
import useModel from 'useModel';

const [state, actions] = useModel('example');
```

#### Comparison
* Communicating through context is the most complicated. It requires consIDering common ancestors, creating ProvIDers, and so on. Additionally, in terms of implementation, Zustand already uses an external store, so adding another layer isn't necessary.
* Returning a hook requires `createModel` at first.
* The issue with ID is that `useModel` needs to record a global ID. The coupling with the ID is subtle and not easily traceable, increasing the possibility of errors.
Overall, returning a hook seems slightly better.


### Calling another model within a model
I haven't encountered a scenario where calling actions of another model within a model is necessary. Any scenarios I can think of can be managed with services and utilities.
Other coupling I can think of are generated in the view layer, so we can trigger actions of multiple models in one component.