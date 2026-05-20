import { createRoot } from "react-dom/client";
import { ClerkProvider, SignIn, useAuth } from "@clerk/react";
import { useEffect } from "react";
import { setTokenGetter } from "./lib/auth-fetch";
import App from "./App";
import "./index.css";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

function AuthGate() {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  useEffect(() => {
    if (isSignedIn) setTokenGetter(getToken);
  }, [isSignedIn, getToken]);

  if (!isLoaded) {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f9fafb",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: "4px solid #1a5c36", borderTopColor: "transparent",
          animation: "spin 0.7s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#f9fafb", padding: 16,
      }}>
        <SignIn
          routing="path"
          path={`${BASE}/sign-in`}
          signUpUrl={`${BASE}/sign-up`}
          forceRedirectUrl={`${BASE}/`}
        />
      </div>
    );
  }

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <ClerkProvider
    publishableKey={clerkPubKey}
    signInUrl={`${BASE}/sign-in`}
    signUpUrl={`${BASE}/sign-up`}
    routerPush={(to) => window.history.pushState(null, "", to)}
    routerReplace={(to) => window.history.replaceState(null, "", to)}
    localization={{
      signIn: { start: { title: "Sign in to Farm Buddy" } },
      signUp: { start: { title: "Create your Farm Buddy account" } },
    }}
  >
    <AuthGate />
  </ClerkProvider>
);
