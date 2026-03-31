import { MainLayout } from "./components/layout/MainLayout";
import { I18nProvider } from "./lib/i18n";

export default function App() {
  return (
    <I18nProvider>
      <MainLayout />
    </I18nProvider>
  );
}
