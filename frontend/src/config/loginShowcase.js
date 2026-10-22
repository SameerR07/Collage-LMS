/* =========================================================
   Login page — side cards (right of the sign-in card)

   Quick Stats   The numbers are LIVE: counted from the LMS
                 records and updated whenever they change
                 (rules in src/lib/statsCore.js). Only the
                 wording shown on the card is set here.

   campusPhotos  Photos live in src/assets/login/ as
                 campus-1.jpg and campus-2.jpg (.jpeg, .png and
                 .webp work too). Replace a file to change a photo.
                 Without a photo, a designed tile is shown.
                 position: optional focus point, e.g. 'center 30%'.
========================================================= */

export const quickStatsText = {
  title: 'Quick stats',
  students: 'Total Students',
  companies: 'Recruiting Companies',
  placement: 'Placement Rate',
  note: 'Live from LMS records',
}

export const campusPhotos = [
  {
    file: 'campus-1',
    caption: 'Placement drives',
    icon: 'work',
    alt: 'Students in formal wear talking with recruiters at a placement fair stall',
  },
  {
    file: 'campus-2',
    caption: 'Campus to corporate',
    icon: 'campus',
    alt: 'Students speaking with a company representative across a recruitment desk',
  },
]
