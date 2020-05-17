const socket = require('socket.io');
let driverList = require('./routers/driverCreationRouter').driverList;
let Driver = require('./Model/Driver');
const auth = require('./utils/jwtauth');
let activeDrivers = [];
let userList = [];
let tokenID = 0;

const queueWaitingTime = 20*60; // In Seconds
const tokenIDResetTime = 2*24*60*60; // In Seconds

module.exports.setupSocket = (server) => {
    const io = socket(server);
    
    // Automatically remove users from the queue after they have waited for more than queueWaitingTime Seconds
    // Change the interval time to an appropriate value
    // With the current interval, in worst case, user will stay in queue for 2*queueWaitingTime seconds
    setInterval(() => {
        let numOfUsers = 0;
        while(numOfUsers < userList.length && 
            Date.now() - userList[numOfUsers].timeStamp > queueWaitingTime*1000){
            // Send remove user broadcast for these users
            io.emit('removeUser', {id: userList[numOfUsers].id})
            numOfUsers++;
        }
        userList.splice(0, numOfUsers);
        console.log(`removed ${numOfUsers} users from the queue.`);
    }, queueWaitingTime*1000);
    
    // Reset the tokenID to 0 after tokenIDResetTime
    setInterval(() => {tokenID = 0;}, tokenIDResetTime*1000);

    /** ======================================= 
     * Responses to the User socket Calls
     ** ========================================*/
    io.on('connection', (socket) => {
        let userDriverList = {userList:userList, driverList:activeDrivers};
        console.log(`made socket connection: ${socket.id}`);
        
        // Provide base-data (requested while establishing new connetion or while reconnecting)
        socket.on('onConnection', () => {
            socket.emit('connectionResponse', userDriverList);
        });

        socket.on('book', (user) => {
            user.id = tokenID++;
            console.log(`BOOK: ${user.id}`);
            userList.push(user);
            // Confirm Booking
            socket.emit('bookResponse', user);
            // Notify to all 
            socket.broadcast.emit('addUser', user);
        });

        socket.on('unbook', (userID) => {
            console.log(`UNBOOK: ${userID}`);
            const index = userList.findIndex(user => user.id == userID);
            userList.splice(index, 1);
            // Confirm UnBook
            socket.emit('unbookResponse', {id: userID});
            // Notify to all
            socket.broadcast.emit('removeUser', {id: userID});
        });

        socket.on('gotIn', (userID) => {
            // Works same as unbook
            // Can be used to determine the destination of the BOV
            console.log(`GOTIN: ${userID}`);
            const index = userList.findIndex(user => user.id == userID);
            userList.splice(index, 1);
            // Confirm GotIn
            socket.emit('gotInResponse', {id: userID});
            // Notify to all
            socket.broadcast.emit('removeUser', {id: userID});
        });

    /** ======================================= 
     * Responses to the Driver socket Calls
     ** ========================================*/

        socket.on('registerDriver', (driver) => {
            // Verify JWT token
            const driverInfo = auth.verifyInfo(driver.token);
            
            if(!driverInfo){
                // If unsuccessful send Auth failed
                socket.emit('driverAuthFailed', {message: 'Login Again!'});
                return;
            }
            if(activeDrivers.find(driverData => driverData.phoneNumber === driverInfo.phoneNumber)){
                // Driver already exists
                return;
            }

            // Add driver in activeDriversList
            const newDriver = new Driver(driverInfo.phoneNumber, driver.location, Date.now());
            activeDrivers.push(newDriver);

            // Send updateDriverData broadcast to all
            socket.emit('updateDriverData', newDriver);
        });

        socket.on('updateDriverLocation', (driverData) => {
            // Verify JWT token
            const driverInfo = auth.verifyInfo(driverData.token);

            if(!driverInfo){
                // If unsuccessful send Auth failed
                socket.emit('driverAuthFailed', {message: 'Login Again!'});
                return;
            }
            // Find driver in activeDrivers list
            const driver = activeDrivers.find(tmpDriver => tmpDriver.phoneNumber === driverInfo.phoneNumber);
            if(!driver){
                // If unsuccessful send Auth failed
                socket.emit('driverAuthFailed', {message: 'Login Again!'});
                return;
            }

            // Update location
            driver.updateLocation(driverData);

            // send updateLocation broadcast to all
            socket.emit('updateDriverLocation', {
                location: driver.location, 
                phoneNumber:driver.phoneNumber,
                timeStamp: driver.timeStamp
            });
            
        });

        socket.on('updateDriverData', (driverData) => {
            // Verify JWT token
            const driverInfo = auth.verifyInfo(driverData.token);

            if(!driverInfo){
                // If unsuccessful send Auth failed
                socket.emit('driverAuthFailed', {message: 'Login Again!'});
                return;
            }
            // Find driver in activeDrivers list
            const driver = activeDrivers.find(tmpDriver => tmpDriver.phoneNumber === driverInfo.phoneNumber);
            if(!driver){
                // If unsuccessful send Auth failed
                socket.emit('driverAuthFailed', {message: 'Login Again!'});
                return;
            }

            // Update data
            driver.updateData(driverData);

            // send updateLocation broadcast to all
            socket.emit('updateDriverData', driver);
        });
    });
}


/**  ===================================
 * Changes required in frontend: 
 * 1.) change driver.id to driver.phoneNumber
 * 2.) change driver.status to driver.isActive
 * 3.) Add "key" attribute in the driver object
 *     driver.key = driver.phoneNum+driver.password(remove the last 2 chars of the password for safety :) )
 * 4.) Clarify whether the driver.location.location is the location of the pickuppoint
 *     or is it the current location of the driver
 * 5.) Properly link files and change path problems
 * =========================================*/