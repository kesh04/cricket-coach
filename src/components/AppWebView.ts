import type { ComponentType, Ref } from 'react';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';

/**
 * react-native-webview 14 (Expo SDK 58) declares its component as `WebView<P = undefined>`,
 * and `WebViewProps & undefined` is `never` for TypeScript, so every prop fails to type-check
 * although the component works. This re-export gives it plain props and a typed handle.
 */
export type WebViewHandle = { injectJavaScript(script: string): void; reload(): void };
export const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;
export type { WebViewMessageEvent } from 'react-native-webview';
