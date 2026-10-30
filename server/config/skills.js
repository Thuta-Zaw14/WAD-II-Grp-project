// The skills people can pick on their profile.
// One list for the whole app: the server checks against it and the
// frontend loads it from GET /api/options. To add a skill, add a line here.
export const skillList = [
  { name: 'Tennis', category: 'Sports' },
  { name: 'Basketball', category: 'Sports' },
  { name: 'Videography', category: 'Creative' },
  { name: 'Photo editing', category: 'Creative' },
  { name: 'Guitar basics', category: 'Music' },
  { name: 'Python intro', category: 'Tech' },
  { name: 'Excel basics', category: 'Tech' },
]

// Same regions as the filter on the home page
export const regionList = ['Central', 'West', 'East', 'North']