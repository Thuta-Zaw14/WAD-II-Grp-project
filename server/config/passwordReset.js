// The "Forget Password" code on the login page (see routes/passwordResets.js).
//
// FOR TESTING ONLY. Every account shares this one code, and nothing is emailed yet, so anyone
// who knows someone's email address can set a new password for them. Before the site goes live,
// replace this with a random code per request that is emailed to the person and expires.
export const TEST_RESET_CODE = '123456'

// The same 6 characters as everywhere else: sign-up and the profile's change-password form
// (Firebase's own minimum) and the reset form on the login page.
export const MIN_PASSWORD_LENGTH = 6
