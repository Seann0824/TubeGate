/** The manifest fields consumed by package validation. */
export interface ManifestV3 {
  background: { service_worker: string };
  action: { default_popup: string; default_icon?: Record<string, string> };
  options_page: string;
  icons?: Record<string, string>;
  content_scripts: { js: string[]; css?: string[] }[];
}
