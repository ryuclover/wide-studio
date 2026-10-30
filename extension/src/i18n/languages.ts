export const languages=[['original','Original · Wide'],['pt-BR','Português (Brasil)'],['en','English'],['es','Español'],['fr','Français'],['de','Deutsch']] as const;
export type Language=typeof languages[number][0];
export const validLanguage=(value:unknown):value is Language=>languages.some(([id])=>id===value);
