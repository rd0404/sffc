// One row per SFFC team. `fplClubId` ties the team to a real EPL club (from
// bootstrap-static "teams"), so its weekly opponent is derived automatically
// from the real fixture list. `leagueId` is the classic mini-league (6
// managers) for that club — this is the ONLY thing that ever needs updating
// by hand, and only if a club's league is recreated.
//
// Entry IDs, manager names, and live points are NOT stored here — they're
// pulled fresh from the leagues-classic standings endpoint on every request,
// so there is nothing to keep in sync manually.

module.exports = [
  { club: "Arsenal",         fplClubId: 1,  leagueId: 1263406 },
  { club: "Aston Villa",     fplClubId: 2,  leagueId: 28452 },
  { club: "Bournemouth",     fplClubId: 3,  leagueId: 292453 },
  { club: "Brentford",       fplClubId: 4,  leagueId: 1263170 },
  { club: "Brighton",        fplClubId: 5,  leagueId: 1263164 },
  { club: "Chelsea",         fplClubId: 6,  leagueId: 1027656 },
  { club: "Coventry City",   fplClubId: 7,  leagueId: 1301027 },
  { club: "Crystal Palace",  fplClubId: 8,  leagueId: 1264563 },
  { club: "Everton",         fplClubId: 9,  leagueId: 1265475 },
  { club: "Fulham",          fplClubId: 10, leagueId: 1263796 },
  { club: "Hull City",       fplClubId: 11, leagueId: 1506205 },
  { club: "Ipswich Town",    fplClubId: 12, leagueId: 1308192 },
  { club: "Leeds",           fplClubId: 13, leagueId: 1436276 },
  { club: "Liverpool",       fplClubId: 14, leagueId: 1024955 },
  { club: "Man City",        fplClubId: 15, leagueId: 1107689 },
  { club: "Man Utd",         fplClubId: 16, leagueId: 1341741 },
  { club: "Newcastle",       fplClubId: 17, leagueId: 1267182 },
  { club: "Nott'm Forest",   fplClubId: 18, leagueId: 1265911 },
  { club: "Spurs",           fplClubId: 19, leagueId: 1347752 },
  { club: "Sunderland",      fplClubId: 20, leagueId: 1305200 },
];
