import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";

const APP_VERSION = "1.0.0";

const LINKS = {
  github: "https://github.com/BOTOOM/Cliprithm",
  website: "https://edwardiaz.dev",
  linkedin: "https://www.linkedin.com/in/edwardiazruiz",
  email: "mailto:edwardiazruiz@gmail.com",
  bugReport: "https://github.com/BOTOOM/Cliprithm/issues/new?template=bug_report.yml",
  featureRequest: "https://github.com/BOTOOM/Cliprithm/issues/new?template=feature_request.yml",
  contribute: "https://github.com/BOTOOM/Cliprithm/blob/main/CONTRIBUTING.md",
  githubSponsors: "https://github.com/sponsors/BOTOOM",
  buyMeACoffee: "https://www.buymeacoffee.com/edwardiazdev",
};

export function AboutView() {
  const { t } = useI18n();

  const openUrl = (url: string) => {
    tauriOpenUrl(url).catch(console.error);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header with logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-tertiary/10 border border-outline-variant/30">
            <img src="/logo.svg" alt="Cliprithm" className="w-14 h-14" />
          </div>
          <h1 className="text-2xl font-bold text-on-surface">Cliprithm</h1>
          <p className="text-xs font-mono text-primary">
            {t("about.version", { version: APP_VERSION })}
          </p>
          <p className="text-sm text-on-surface-variant leading-relaxed max-w-md mx-auto">
            {t("about.description")}
          </p>
        </div>

        {/* Made by */}
        <div className="glass-panel rounded-xl p-5 ghost-border">
          <div className="flex items-center gap-4">
            <img
              src="https://avatars.githubusercontent.com/u/28914781?v=4"
              alt="Edwar Diaz"
              className="w-14 h-14 rounded-full border-2 border-primary/30"
            />
            <div className="flex-1">
              <p className="text-xs text-on-surface-variant mb-0.5">
                {t("about.madeBy")}
              </p>
              <p className="text-base font-bold text-on-surface">
                Edwar Diaz
              </p>
              <p className="text-xs text-on-surface-variant">
                Full-Stack & DevOps Engineer
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <LinkButton
              icon="language"
              label={t("about.website")}
              onClick={() => openUrl(LINKS.website)}
            />
            <LinkButton
              icon="code"
              label={t("about.github")}
              onClick={() => openUrl(LINKS.github)}
            />
            <LinkButton
              icon="work"
              label="LinkedIn"
              onClick={() => openUrl(LINKS.linkedin)}
            />
            <LinkButton
              icon="mail"
              label="Email"
              onClick={() => openUrl(LINKS.email)}
            />
          </div>
        </div>

        {/* Sponsor section */}
        <div className="rounded-xl p-5 bg-gradient-to-br from-tertiary/10 to-primary/5 border border-tertiary/20">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-tertiary/20 flex items-center justify-center shrink-0">
              <Icon name="favorite" className="text-tertiary text-xl" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">
                {t("about.sponsor")}
              </h3>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                {t("about.sponsorDesc")}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="surface"
              size="sm"
              onClick={() => openUrl(LINKS.githubSponsors)}
              className="flex-1"
            >
              <Icon name="favorite" className="text-sm mr-1.5" />
              {t("about.githubSponsors")}
            </Button>
            <Button
              variant="surface"
              size="sm"
              onClick={() => openUrl(LINKS.buyMeACoffee)}
              className="flex-1"
            >
              <Icon name="coffee" className="text-sm mr-1.5" />
              {t("about.buyMeACoffee")}
            </Button>
          </div>
        </div>

        {/* Open Source */}
        <div className="glass-panel rounded-xl p-5 ghost-border">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Icon name="code" className="text-primary text-xl" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">
                {t("about.openSource")}
              </h3>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                {t("about.openSourceDesc")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ActionButton
              icon="bug_report"
              label={t("about.reportBug")}
              onClick={() => openUrl(LINKS.bugReport)}
            />
            <ActionButton
              icon="lightbulb"
              label={t("about.requestFeature")}
              onClick={() => openUrl(LINKS.featureRequest)}
            />
            <ActionButton
              icon="handshake"
              label={t("about.contribute")}
              onClick={() => openUrl(LINKS.contribute)}
            />
          </div>
        </div>

        {/* Built with */}
        <div className="glass-panel rounded-xl p-5 ghost-border">
          <h3 className="text-xs font-semibold text-on-surface-variant mb-3">
            {t("about.builtWith")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {["Tauri", "React", "TypeScript", "Rust", "FFmpeg", "TailwindCSS", "Zustand", "SQLite"].map(
              (tech) => (
                <span
                  key={tech}
                  className="px-2.5 py-1 text-[10px] font-mono rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant/20"
                >
                  {tech}
                </span>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-on-surface-variant/50 pb-4">
          {t("about.thanksMessage")} 💜
        </p>
      </div>
    </div>
  );
}

function LinkButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-on-surface-variant hover:text-primary rounded-lg hover:bg-surface-container transition-colors"
    >
      <Icon name={icon} className="text-sm" />
      {label}
    </button>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-3 rounded-lg hover:bg-surface-container-high transition-colors text-center"
    >
      <Icon name={icon} className="text-lg text-primary" />
      <span className="text-[10px] text-on-surface-variant leading-tight">
        {label}
      </span>
    </button>
  );
}
