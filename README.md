URL of App: https://wad-kongsi.vercel.app
URL of the public Git repo: https://github.com/Thuta-Zaw14/WAD-II-Grp-project

The easiest way to test is the live app above. Local setup is only needed if you want to run the code yourself.
## Set up
Requirements: Node.js 20 or newer, and npm.

1. Clone the repository and switch to the branch:
   git clone https://github.com/Thuta-Zaw14/WAD-II-Grp-project.git
   cd WAD-II-Grp-project
   git switch last-resort
2. Install the front end: npm install
3. Create a file called .env in the project root (next to package.json) with:
VITE_FIREBASE_API_KEY = "AIzaSyDpPJ5F89ReeyLEtil5zdGaJSkXJyxQoEk"
VITE_FIREBASE_AUTH_DOMAIN = "wadii-project-c1e14.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID = "wadii-project-c1e14"
VITE_FIREBASE_STORAGE_BUCKET = "wadii-project-c1e14.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID = "58717159700"
VITE_FIREBASE_APP_ID = "1:58717159700:web:e1ce595200c460cd4bc201"
VITE_API_URL = "http://localhost:3000/api"
   (Use NAME=value, with no quotes or colons.)
4.server/firebaseKey.json is in the submission zip
5. Install the server: cd server, then npm install
6. Put the Firebase service account key at server/firebaseKey.json.

## Run
Use two terminals:
- Terminal 1 (server): cd server, then npm run dev  → API on http://localhost:3000/api
- Terminal 2 (front end, project root): npm run dev  → open http://localhost:5173

Admin 
 - Admin Function
    1. Login to an admin account in the Login page (account email/password does not have quotations)
    
    Admin Example Account 1
    Email: "admin1@example.com"
    Password: "iLikeeWAD2!"

    Admin Example Account 2
    Email: "admin2@example.com"
    Password: "Wad2isActuallyFun"

    Admin Example Account 3
    Email: "admin3@example.com"
    Password: "Wad2SoFun"

    Admin Example Account 4 
    Email: "gooadmin@gmail.com"
    Password: "iamgoo"

    2. After logging in, the backend will verify admin status and the page will be redirected to /admins after a successful authentication and authorisation, it will show all users details (excluding admin)

    3. Click on "View" button to view a particular user profile in admin view
      In user profile, admin can review users details, take actions, warning history and report history.
      Admin can view the profile of the reporter in admin mode by clicking the reporter's name from the user profile
      <br>
      3ai. If user is active, click on "Ban User" to ban a user, it will prompt a confirmation alert to confirm a ban, when "OK" is clicked, it will ban the user
      <br>
      3aii. If user is banned, click on "Unban User" to unban user, it will prompt a confirmation alert to confirm an unban
      when "OK" is clicked, it will unban the user
      <br>
      3b. Admin can send out warnings to users after admin reviewed their activities without banning them

    4. Click on "Disputes" to review reports

    5. Click on "Message reports" to see the decisions made and what is handled recently

   - Others: 
      <br>
      There is no way of creating an admin account from the frontend (Hi prof, if you need more accounts, can ask us to create more)
      <br>
      Admin will be logged out if they exit the tab and they have to log in again if they want to use another tab


------------------------------------------------------------------------------------------------------------------

Users
  - User Function
  1. When users first come to the web app, they will go to the landing page to find out what the app does
  
  2. Users can then click on Login or Sign up button to either login to their account or to sign up for an account
    1. After signing up, they will go to the /home page and they will be able to see a tutorial guide on setting up their accounts
    2. After logging in, they will go to /home page, if they have completed the tutorial guide, the tutorial guide will not appear, if not, it will show the uncompleted steps collapsed or uncollapsed depending on how user configure it in the previous session.
    3. If users are issued warnings, they will see it at the top at the home page.
    4. Example accounts (account email and password does not have quotations):
    
    User Example Account 1 (Student account)
    Email: "demo5@gmail.com"
    Password: "iamdemo5"
    
    User Example Account 2 (Banned account)
    Email: "d4c@gmail.com"
    Password: "iamd4c"
    
    User Example Account 3 (Teacher account)
    Email: "make@gmail.com"
    Password: "iammake"

    User Example Account 4 (Broke account)
    Email: "demo3@gmail.com"
    Password: "iamdemo3"

    User Example Account 5 (Was referred by other users)
    Email: "refer@gmail.com"
    Password: "iamrefer"

  3. Users can edit their profile, change password, update their preferences, manage their teaching and learning skills.
    1. Users must declare the skills they can teach before they can add courses that they want to teach.
    2. Completed skill courses will appear in the skill card.
  
  4. In the courses pages, users can search for a course or taught by a specific user, filter by locations, browse courses, view details, book a session, look and post questions & discussions about a specific course by a specific user. 
  <br>
  5a. After that, users can view their classes in "My Classes". They can view details of the booked course, do a reflection after they have completed the course and chat with the instructor for other details under "Classes I Am Attending".
  <br>
  5b. Also, users can see the classes they are hosting, view current and past students, chat with a specific student and edit course details. 

  6. In the insights tab, users can view statistics what are the most wanted skills by other students.
    1. Users can send their friends a referral link for them to sign up and earn credits.

  7. In the reports tab, users can file a report for various issues and see past reports and status.
