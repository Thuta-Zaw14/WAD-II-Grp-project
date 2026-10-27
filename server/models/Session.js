/*
- desc : String
- date of post : DateTime
- owner : User.class
- timeslot : ArrayList<DateTime>
- location : googlemap obj
- skills : String (separate or put in desc?)
- capacity (int, int)
- Reviews : ArrayList<Reviews>

*/
import Review from "./Review";
class Session {
    constructor(desc, postDate, owner, timeslot, location, skill, capacity, reviews) {
        this.desc = desc;
        this.postDate = postDate;
        this.owner = owner;
        this.timeslot = timeslot;
        this.location = location;
        this.skill = skill;
        this.capacity = capacity;
        this.reviews = reviews;
    }

}

export default Session;