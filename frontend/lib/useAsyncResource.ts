"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CacheEntry<T> = {
	data?: T;
	error?: string;
	promise?: Promise<T>;
};

type ResourceState<T> = {
	data: T | undefined;
	error: string;
	isLoading: boolean;
	isRefreshing: boolean;
	key: string;
};

type ResourceOptions<T> = {
	enabled?: boolean;
	initialData?: T;
	reloadOnDataChange?: boolean;
};

export const DataRefreshEvent = "industrial-workspace-data-changed";
const ResourceCache = new Map<string, CacheEntry<unknown>>();

function GetErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}

export function InvalidateAsyncResource(key?: string) {
	if (key) {
		ResourceCache.delete(key);
		return;
	}
	ResourceCache.clear();
}

export function useAsyncResource<T>(
	key: string,
	loader: () => Promise<T>,
	options: ResourceOptions<T> = {},
) {
	const enabled = options.enabled ?? true;
	const reloadOnDataChange = options.reloadOnDataChange ?? true;
	const loaderRef = useRef(loader);
	const requestIdRef = useRef(0);
	const [state, setState] = useState<ResourceState<T>>(() => {
		const cached = ResourceCache.get(key) as CacheEntry<T> | undefined;
		const data = cached?.data ?? options.initialData;
		return {
			data,
			error: cached?.error ?? "",
			isLoading: enabled && data === undefined,
			isRefreshing: false,
			key,
		};
	});

	useEffect(() => {
		loaderRef.current = loader;
	}, [loader]);

	const reload = useCallback(
		async (force = false) => {
			if (!enabled) return undefined;
			const requestId = requestIdRef.current + 1;
			requestIdRef.current = requestId;
			const cached = ResourceCache.get(key) as CacheEntry<T> | undefined;
			const currentData = cached?.data;

			setState((current) => {
				const data =
					currentData ?? (current.key === key ? current.data : undefined);
				return {
					data,
					error: force || current.key !== key ? "" : current.error,
					isLoading: data === undefined,
					isRefreshing: data !== undefined,
					key,
				};
			});

			let entry = cached;
			if (!entry || force || !entry.promise) {
				const promise = loaderRef
					.current()
					.then((result) => {
						ResourceCache.set(key, { data: result });
						return result;
					})
					.catch((error: unknown) => {
						const message = GetErrorMessage(error, "Request failed");
						ResourceCache.set(key, { data: entry?.data, error: message });
						throw error;
					});
				entry = { data: entry?.data, promise };
				ResourceCache.set(key, entry);
			}

			try {
				const result = (await entry.promise) as T;
				if (requestIdRef.current === requestId) {
					setState({
						data: result,
						error: "",
						isLoading: false,
						isRefreshing: false,
						key,
					});
				}
				return result;
			} catch (error) {
				if (requestIdRef.current === requestId) {
					setState((current) => ({
						...current,
						error: GetErrorMessage(error, "Request failed"),
						isLoading: false,
						isRefreshing: false,
						key,
					}));
				}
				return undefined;
			}
		},
		[enabled, key],
	);

	useEffect(() => {
		void reload();
	}, [reload]);

	useEffect(() => {
		if (!enabled || !reloadOnDataChange) return;
		const handleDataChange = () => {
			void reload(true);
		};
		window.addEventListener(DataRefreshEvent, handleDataChange);
		return () => window.removeEventListener(DataRefreshEvent, handleDataChange);
	}, [enabled, reload, reloadOnDataChange]);

	if (state.key !== key) {
		const cached = ResourceCache.get(key) as CacheEntry<T> | undefined;
		const data = cached?.data ?? options.initialData;
		return {
			data,
			error: cached?.error ?? "",
			isLoading: enabled && data === undefined,
			isRefreshing: false,
			reload,
		};
	}

	return {
		data: state.data,
		error: state.error,
		isLoading: state.isLoading,
		isRefreshing: state.isRefreshing,
		reload,
	};
}
