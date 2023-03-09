const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");

describe("CrowdFunding", function () {
    const goal = 1500;
    const feeRate = 1;
    const feeScaleFactor = 100;

    async function deployAndCreateProject() {
        const [owner, alice, bob, john] = await ethers.getSigners();

        const MyToken = await hre.ethers.getContractFactory("MyToken");
        const myToken = await MyToken.deploy();
        await myToken.deployed();

        console.log(
            `MyToken deployed to ${myToken.address}`
        );

        myToken.mint(bob.address, 1000);
        myToken.mint(john.address, 1000);

        const CrowdFunding = await hre.ethers.getContractFactory("CrowdFunding");
        const crowdFunding = await CrowdFunding.deploy(myToken.address, feeRate, feeScaleFactor);
        await crowdFunding.deployed();

        expect(await crowdFunding.owner()).to.equal(owner.address);

        const ONE_DAY_IN_SECS = 24 * 60 * 60;
        const deadline = (await time.latest()) + ONE_DAY_IN_SECS;
        await expect(crowdFunding.connect(alice).createProject(goal, deadline)).to.emit(crowdFunding, "ProjectCreated").withArgs(1, alice.address, goal, deadline);

        return { crowdFunding, myToken, deadline, owner, alice, bob, john };
    }

    describe("Create Project", function () {
        it("Should create a new project", async function () {
            const { crowdFunding, deadline, alice } = await loadFixture(deployAndCreateProject);
    
            expect(await crowdFunding.numProjects()).to.equal(1);

            const project = await crowdFunding.projects(1);
            expect(project.id).to.equal(1);
            expect(project.goal).to.equal(goal);
            expect(project.deadline).to.equal(deadline);
            expect(project.amountRaised).to.equal(0);
            expect(project.owner).to.equal(alice.address);
            expect(project.ended).to.equal(false);
            expect(project.succeeded).to.equal(false);
        });
    
        it("Fails with invalid parameters", async function () {
            const { crowdFunding, deadline } = await loadFixture(deployAndCreateProject);
    
            await expect(crowdFunding.createProject(0, deadline)).to.be.revertedWithCustomError(crowdFunding, "InvalidGoal");
            await expect(crowdFunding.createProject(goal, await time.latest())).to.be.revertedWithCustomError(crowdFunding, "InvalidDeadline");
        });
    });

    describe("Fund Project", function () {
        it("Should transfer the token and increase the contribution", async function () {
            const { crowdFunding, myToken, bob } = await loadFixture(deployAndCreateProject);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await expect(crowdFunding.connect(bob).fundProject(1, 900)).to.emit(crowdFunding, "ProjectFunded").withArgs(1, bob.address, 900);

            const contribution = await crowdFunding.contributions(1, bob.address);
            expect(contribution).to.equal(900);
            
            expect(await myToken.balanceOf(bob.address)).to.equal(100);
        });
    
        it("Fails with invalid project id or amount", async function () {
            const { crowdFunding, myToken, bob } = await loadFixture(deployAndCreateProject);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await expect(crowdFunding.connect(bob).fundProject(0, 900)).to.be.revertedWithCustomError(crowdFunding, "InvalidProjectId");
            await expect(crowdFunding.connect(bob).fundProject(2, 900)).to.be.revertedWithCustomError(crowdFunding, "InvalidProjectId");
            await expect(crowdFunding.connect(bob).fundProject(1, 0)).to.be.revertedWithCustomError(crowdFunding, "InvalidAmount");
        });

        it("Fails when the deadline is past", async function () {
            const { crowdFunding, myToken, deadline, bob } = await loadFixture(deployAndCreateProject);

            await time.increaseTo(deadline);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await expect(crowdFunding.connect(bob).fundProject(1, 900)).to.be.revertedWithCustomError(crowdFunding, "DeadlineAlreadyPassed");
        });
    });

    describe("End Project", function () {
        it("Should end the project and transfer the token to the owner and project owner", async function () {
            const { crowdFunding, deadline, myToken, owner, alice, bob, john } = await loadFixture(deployAndCreateProject);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await myToken.connect(john).approve(crowdFunding.address, 1000);

            await crowdFunding.connect(bob).fundProject(1, 1000);
            await crowdFunding.connect(john).fundProject(1, 1000);

            await time.increaseTo(deadline);

            await expect(crowdFunding.connect(alice).endProject(1)).to.emit(crowdFunding, "ProjectEnded").withArgs(1, true);

            const project = await crowdFunding.projects(1);
            expect(project.ended).to.equal(true);
            expect(project.succeeded).to.equal(true);

            const fee = 2000 * feeRate / feeScaleFactor;
            expect(await myToken.balanceOf(owner.address)).to.equal(fee);
            expect(await myToken.balanceOf(alice.address)).to.equal(2000 - fee);
        });

        it("Can only be called by the project owner", async function () {
            const { crowdFunding, myToken, alice, bob } = await loadFixture(deployAndCreateProject);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await crowdFunding.connect(bob).fundProject(1, 1000);
            await expect(crowdFunding.connect(bob).endProject(1)).to.be.revertedWithCustomError(crowdFunding, "CallerNotProjectOwner");
        });
    
        it("Fails when the deadline is not passed", async function () {
            const { crowdFunding, myToken, alice, bob } = await loadFixture(deployAndCreateProject);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await crowdFunding.connect(bob).fundProject(1, 1000);
            await expect(crowdFunding.connect(alice).endProject(1)).to.be.revertedWithCustomError(crowdFunding, "DeadlineNotPassedYet");
        });

        it("Fails when the proejct has already ended", async function () {
            const { crowdFunding, myToken, deadline, alice, bob } = await loadFixture(deployAndCreateProject);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await crowdFunding.connect(bob).fundProject(1, 1000);

            await time.increaseTo(deadline);

            await crowdFunding.connect(alice).endProject(1)
            await expect(crowdFunding.connect(alice).endProject(1)).to.be.revertedWithCustomError(crowdFunding, "ProjectAlreadyEnded");
        });
    });

    describe("Withdraw Funds", function () {
        it("Should reset the contribution and withdraw the funds to the contributor", async function () {
            const { crowdFunding, deadline, myToken, alice, bob } = await loadFixture(deployAndCreateProject);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await crowdFunding.connect(bob).fundProject(1, 1000);
            await time.increaseTo(deadline);
            await crowdFunding.connect(alice).endProject(1);

            expect(await myToken.balanceOf(bob.address)).to.equal(0);
            await expect(crowdFunding.connect(bob).withdrawFunds(1)).to.emit(crowdFunding, "ProjectFunded").withArgs(1, bob.address, 0);
            expect(await myToken.balanceOf(bob.address)).to.equal(1000);
            
            const contribution = await crowdFunding.contributions(1, bob.address);
            expect(contribution).to.equal(0);
        });

        it("Fails when the project is not ended yet", async function () {
            const { crowdFunding, deadline, myToken, alice, bob } = await loadFixture(deployAndCreateProject);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await crowdFunding.connect(bob).fundProject(1, 1000);

            await expect(crowdFunding.connect(bob).withdrawFunds(1)).to.be.revertedWithCustomError(crowdFunding, "ProjectNotEndedYet");
        });
    
        it("Fails when the project is successful", async function () {
            const { crowdFunding, deadline, myToken, alice, bob, john } = await loadFixture(deployAndCreateProject);
    
            await myToken.connect(bob).approve(crowdFunding.address, 1000);
            await myToken.connect(john).approve(crowdFunding.address, 1000);
            await crowdFunding.connect(bob).fundProject(1, 1000);
            await crowdFunding.connect(john).fundProject(1, 1000);
            await time.increaseTo(deadline);
            await crowdFunding.connect(alice).endProject(1);

            await expect(crowdFunding.connect(bob).withdrawFunds(1)).to.be.revertedWithCustomError(crowdFunding, "CannotWithdrawFromSuccessfulProject");
        });
    });
});