import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import transform from 'lodash.transform';
import { createContainer } from './createContainer';
import { Config } from './types';

const isDev = process.env.NODE_ENV !== 'production';

export function createModel(config: Config, namespace?: string, modelsActions?) {
  const { state: defineState = {}, reducers = [], effects = [] } = config;

  function useFunctionsState(functions) {
    const functionsInitialState = useMemo(
      () => transform(functions, (result, value, name) => {
        result[name] = {
          isLoading: false,
          error: null,
        };
      }, {}),
      [functions],
    );
    const [ functionsState, setFunctionsState ] = useState(() => functionsInitialState);
    const setFunctionState = useCallback(
      (name, args) => setFunctionsState(prevState => ({
        ...prevState,
        [name]: {
          ...prevState[name],
          ...args,
        },
      })),
      [],
    );
    return [ functionsState, setFunctionsState, setFunctionState ];
  }

  function useEffects(state) {
    const [ effectsState, , setEffectState ] = useFunctionsState(effects);
    const [ effectsInitialPayload, effectsInitialIdentifier ] = useMemo(
      () => transform(effects, (result, effect, name) => {
        const state = {
          args: [],
          identifier: 0,
        };
        result[0][name] = state;
        result[1][name] = state.identifier;
      }, [ {}, {} ]),
      [],
    );
    const [ effectsPayload, setEffectsPayload ] = useState(() => effectsInitialPayload);
    const setEffectPayload = useCallback(
      (name, args) => setEffectsPayload(prevState => ({
        ...prevState,
        [name]: {
          ...prevState[name],
          args,
          identifier: prevState[name].identifier + 1,
        },
      })),
      [],
    );

    const effectsIdentifier = useRef(effectsInitialIdentifier);
    const effectsPayloadIdentifier = Object.keys(effectsPayload).map((name) => effectsPayload[name].identifier);

    useEffect(() => {
      Object.keys(effectsPayload).forEach((name) => {
        const { identifier, args } = effectsPayload[name];
        if (identifier && identifier !== effectsIdentifier.current[name]) {
          effectsIdentifier.current = {
            ...effectsIdentifier.current,
            [name]: identifier,
          };
          (async () => {
            setEffectState(name, {
              isLoading: true,
              error: null,
            });
            try {
              await effects[name](...args, state, modelsActions);
              setEffectState(name, {
                isLoading: false,
                error: null,
              });
            } catch (error) {
              setEffectState(name, {
                isLoading: false,
                error,
              });
            }
          })();
        }
      });
    }, [ effectsPayloadIdentifier ]);

    return [ effectsPayload, setEffectPayload, effectsState ];
  }

  function useModel({ initialState }) {
    const preloadedState = initialState || defineState;
    const [ state, setState ] = useState(preloadedState);
    const [ , executeEffect, effectsState ] = useEffects(state);

    const actions = useMemo(() => ({
      ...transform(reducers, (result, fn, name) => {
        result[name] = (...args) => setState((prevState) => fn(prevState, ...args));
      }),
      ...transform(effects, (result, fn, name) => {
        result[name] = (...args) => executeEffect(name, args);
      }),
    }), []);

    if (namespace && modelsActions) {
      modelsActions[namespace] = actions;
    }
    return [ state, actions, effectsState ];
  }

  if (isDev && namespace) {
    useModel.displayName = namespace;
  }

  return createContainer(
    useModel,
    value => value[0], // state
    value => value[1], // actions
    value => value[2], // effectsState
  );
}

export function createStore(configs: { [namespace: string]: Config }) {
  function Provider({ children, initialStates = {} }) {
    Object.keys(models).forEach(namespace => {
      const [ ModelProvider ] = models[namespace];
      children = <ModelProvider initialState={initialStates[namespace]}>
        {children}
      </ModelProvider>;
    });
    return <>{children}</>;
  }

  function useModelState(namespace: string) {
    const [, useModelState ] = models[namespace];
    return useModelState();
  }

  function useModelAction(namespace: string) {
    const [, , useModelAction ] = models[namespace];
    return useModelAction();
  }

  function useModelEffectState(namespace: string) {
    const [, , , useModelEffectState ] = models[namespace];
    return useModelEffectState();
  }

  function useModel(namespace: string) {
    return [ useModelState(namespace), useModelAction(namespace) ];
  }

  function connect(namespace: string, mapStateToProps?, mapActionsToProps?, mapEffectsState?) {
    return (Component) => {
      return (props): React.ReactElement => {
        const stateProps = mapStateToProps ? mapStateToProps(useModelState(namespace)) : {};
        const actionsProps = mapActionsToProps ? mapActionsToProps(useModelAction(namespace)) : {};
        const effectsStateProps = mapEffectsState ? mapEffectsState(useModelEffectState(namespace)) : {};
        return (
          <Component
            state={stateProps}
            actions={actionsProps}
            effectsState={effectsStateProps}
            {...props}
          />
        );
      };
    };
  }

  const modelsActions = {};
  const models = transform(configs, (result, config, namespace) => {
    result[namespace] = createModel(config, namespace, modelsActions);
  });

  return {
    Provider,
    useModel,
    useModelState,
    useModelAction,
    useModelEffectState,
    connect,
  };
}
