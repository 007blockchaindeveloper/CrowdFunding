// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {
  const feeRate = 1;
  const feeScaleFactor = 100;

  const MyToken = await hre.ethers.getContractFactory("MyToken");
  const myToken = await MyToken.deploy();
  await myToken.deployed();

  console.log(
    `MyToken deployed to ${myToken.address}`
  );

  const CrowdFunding = await hre.ethers.getContractFactory("CrowdFunding");
  const crowdFunding = await CrowdFunding.deploy(myToken.address, feeRate, feeScaleFactor);
  await crowdFunding.deployed();

  console.log(
    `CrowdFunding deployed to ${crowdFunding.address}: feeRate= ${feeRate}, feeScaleFactor = ${feeScaleFactor}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
