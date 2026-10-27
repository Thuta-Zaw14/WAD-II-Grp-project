
class Review {

    constructor(desc, owner) {
        this.desc = desc;
        this.owner = owner;
    }

    getDesc() {
        return this.desc;
    }
    getOwner() {
        return this.owner;
    }
}

export default Review;