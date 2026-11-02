// The "Forget Password" code on the login page (see routes/passwordResets.js).
//
// FOR TESTING ONLY. Every account shares this one code, and nothing is emailed yet, so anyone
// who knows someone's email address can set a new password for them. Before the site goes live,
// replace this with a random code per request that is emailed to the person and expires.
export const TEST_RESET_CODE = '123456'

export const MIN_PASSWORD_LENGTH = 8 // the same as the password form on the profile page
