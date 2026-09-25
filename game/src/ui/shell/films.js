/* The reference films the shell may play (the user's favourites only), with the menu layout each one uses. */

export const FILMS = {
  pc_anatomy: { name: 'Anatomy', theme: 'pc', layout: 'L-row', mark: 'pc' },
  pc_anatomy_ship: { name: 'Anatomy · Ship', theme: 'pc', layout: 'L-row', mark: 'pc' },
  pc_anatomy_battery: { name: 'Anatomy · Battery', theme: 'pc', layout: 'L-row', mark: 'pc' },
  pd_engagement: { name: 'Engagement', theme: 'pc', layout: 'L-col', mark: 'pc' },
  pe_aegis: { name: 'Aegis', theme: 'pc', layout: 'L-col', mark: 'pc' },
  oa_scale: { name: 'Scale', theme: 'orb', layout: 'L-orbA', mark: 'scale' },
  oa_strike: { name: 'Scale · Strike', theme: 'orb', layout: 'L-orbA', mark: 'scale' },
  oe_ring: { name: 'Ring', theme: 'orb', layout: 'L-orbB', mark: 'globe' },
  od_salvo: { name: 'Salvo', theme: 'orb', layout: 'L-orbB', mark: 'globe' },
};

/* the menu picks one of these at random unless Settings pins a film */
export const MENU_POOL = ['pc_anatomy', 'pc_anatomy_ship', 'pc_anatomy_battery', 'pd_engagement', 'pe_aegis'];

export const filmUrl = id => `../reference/films/${id}.html?clean`;

/* the wordmark's small mark, as drawn in each film */
export const MARKS = {
  pc: '<svg viewBox="0 0 24 24"><path d="M12 2 20.5 22h-4.1L12 11.4 7.6 22H3.5z" fill="#fff"/><circle cx="12" cy="18.2" r="1.7" fill="#C6F432"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="#F6F5F2" stroke-width="1.2"><circle cx="11" cy="13" r="8.2"/><path d="M1.5 22.5 22 2"/><rect x="19.2" y="1.4" width="3.8" height="3.8" fill="#F6F5F2" stroke="none"/></svg>',
  globe: '<svg viewBox="0 0 25 25" fill="none" stroke="#F6F5F2" stroke-width="1.2"><circle cx="12.5" cy="12.5" r="10.5"/><path d="M2 12.5h21M12.5 2c-3.2 3-4.6 6.5-4.6 10.5s1.4 7.5 4.6 10.5M12.5 2c3.2 3 4.6 6.5 4.6 10.5s-1.4 7.5-4.6 10.5"/><rect x="11.3" y="11.3" width="2.4" height="2.4" fill="#F4D23C" stroke="none"/></svg>',
};
