import { useEffect } from "react";
import { useLocation } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const t = setTimeout(() => setLocation("/"), 2000);
    return () => clearTimeout(t);
  }, [setLocation]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md mx-4 bg-white rounded-xl shadow p-6">
        <div className="flex mb-4 gap-2 items-center">
          <AlertCircle className="h-8 w-8 text-red-500 shrink-0" />
          <h1 className="text-xl font-bold text-gray-900">Page not found</h1>
        </div>
        <p className="text-sm text-gray-600">Redirecting you to the home screen…</p>
      </div>
    </div>
  );
}
