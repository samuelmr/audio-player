// Back on the remotes of the TV apps: Tizen gives it a key code of its own,
// and the Google TV app (android/) sends it to the page as GoBack
export const BACK = 10009

export const isBack = (e) => e.keyCode == BACK || e.key == 'GoBack'
