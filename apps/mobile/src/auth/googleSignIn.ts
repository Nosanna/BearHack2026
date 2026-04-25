import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

const extra = Constants.expoConfig?.extra ?? {};

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: extra.googleClientIdIos as string | undefined,
    androidClientId: extra.googleClientIdAndroid as string | undefined,
    webClientId: extra.googleClientIdWeb as string | undefined,
  });

  return { request, response, promptAsync };
}
