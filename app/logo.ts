// Logo salonu vrací server na /logo.png: nahrané v Nastavení, jinak výchozí. Verze v adrese obnoví logo po změně.
export const logoSrc = (version?: number) => '/logo.png' + (version ? '?v=' + version : '');
