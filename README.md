# Simple CrowdFunding Project

This repository contains smart contracts, a deployment script and a test script.\
\
The smart contract has following features:\
● Project owners can create a new crowdfunding project.\
● Every new crowdfunded project has a timeline and a funding goal.\
● Users can fund different projects within the timeline.\
● If the funds are not successfully raised by the time the campaign ends, users should be able to withdraw their funds.\
● Each time a project is ended successfully, some fees are taken from the raised funds and transferred to the deployer of the `CrowdFunding` contract. The size of the fee is set in the constructor of this contract.\
\
To run the tests, please open your terminal and run `npx hardhat test`.\
To deploy the contracts, please run `npx hardhat run scripts\deploy.js`.
