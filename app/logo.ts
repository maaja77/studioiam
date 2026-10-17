// Logo salonu vrací server na /logo.png: nahrané v Nastavení, jinak výchozí. Verze v adrese obnoví logo po změně.
// Fotka salonu nahoře na rezervační stránce (jen když je nahraná).
export const coverSrc = (version: number) => '/cover.jpg?v=' + version;
export const logoSrc = (version?: number) => '/logo.png' + (version ? '?v=' + version : '');
