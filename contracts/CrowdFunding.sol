// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error InvalidTokenAddress();
error InvalidFeeScaleFactor();
error InvalidFeeRate();
error CallerNotProjectOwner();
error InvalidGoal();
error InvalidDeadline(uint256 minPossible);
error ProjectAlreadyEnded();
error ProjectNotEndedYet();
error DeadlineAlreadyPassed();
error DeadlineNotPassedYet();
error InvalidAmount();
error CannotWithdrawFromSuccessfulProject();
error InvalidProjectId();

contract CrowdFunding is Ownable {
    using SafeERC20 for IERC20;

    struct Project {
        uint256 id;
        uint256 goal;
        uint256 deadline;
        uint256 amountRaised;
        address owner;
        bool ended;
        bool succeeded;
    }

    struct Contribution {
        address contributor;
        uint256 amount;
    }

    uint256 public numProjects;
    mapping (uint256 => Project) public projects;
    mapping (uint256 => mapping (address => Contribution)) public contributions;

    IERC20 public immutable TOKEN;
    uint256 public immutable FEE_RATE;
    uint256 public immutable FEE_SCALE_FACTOR;

    constructor(address tokenAddress, uint256 feeRate, uint256 feeScaleFactor) {
        if (tokenAddress == address(0)) revert InvalidTokenAddress();
        if (feeScaleFactor == 0) revert InvalidFeeScaleFactor();
        if (feeRate >= feeScaleFactor) revert InvalidFeeRate();

        TOKEN = IERC20(tokenAddress);
        FEE_RATE = feeRate;
        FEE_SCALE_FACTOR = feeScaleFactor;
    }

    event ProjectCreated(uint256 projectId, address owner, uint256 goal, uint256 deadline);
    event ProjectFunded(uint256 projectId, address contributor, uint256 amount);
    event ProjectEnded(uint256 projectId, bool succeeded);

    modifier onlyProjectOwner(uint256 projectId) {
        if (msg.sender != projects[projectId].owner) revert CallerNotProjectOwner();
        _;
    }

    function createProject(uint256 goal, uint256 deadline) external {
        if (goal == 0) revert InvalidGoal();
        if (deadline <= block.timestamp) revert InvalidDeadline(block.timestamp);

        numProjects++;
        projects[numProjects] = Project(numProjects, goal, deadline, 0, msg.sender, false, false);

        emit ProjectCreated(numProjects, msg.sender, goal, deadline);
    }

    function fundProject(uint256 projectId, uint256 amount) external {
        if (projectId == 0 || projectId > numProjects) revert InvalidProjectId();

        Project storage project = projects[projectId];
        if (project.ended) revert ProjectAlreadyEnded();
        if (project.deadline <= block.timestamp) revert DeadlineAlreadyPassed();
        if (amount == 0) revert InvalidAmount();

        Contribution storage contribution = contributions[projectId][msg.sender];
        contribution.contributor = msg.sender;
        contribution.amount += amount;
        project.amountRaised += amount;

        emit ProjectFunded(projectId, msg.sender, amount);

        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
    }

    function endProject(uint256 projectId) external onlyProjectOwner(projectId) {
        if (projectId == 0 || projectId > numProjects) revert InvalidProjectId();

        Project storage project = projects[projectId];
        if (project.ended) revert ProjectAlreadyEnded();
        if (block.timestamp < project.deadline) revert DeadlineNotPassedYet();

        project.ended = true;
        bool succeeded = project.amountRaised >= project.goal;
        project.succeeded = succeeded;

        if (succeeded) {
            uint256 fee = project.amountRaised * FEE_RATE / FEE_SCALE_FACTOR;
            uint256 amountToOwner = project.amountRaised - fee;

            emit ProjectEnded(projectId, true);

            TOKEN.safeTransfer(project.owner, amountToOwner);
            TOKEN.safeTransfer(owner(), fee);
        } else {
            emit ProjectEnded(projectId, false);
        }
    }

    function withdrawFunds(uint256 projectId) external {
        if (projectId == 0 || projectId > numProjects) revert InvalidProjectId();

        Project storage project = projects[projectId];
        if (!project.ended) revert ProjectNotEndedYet();
        if (project.succeeded) revert CannotWithdrawFromSuccessfulProject();

        Contribution storage contribution = contributions[projectId][msg.sender];
        uint256 amountToWithdraw = contribution.amount;
        if (amountToWithdraw > 0) {
            project.amountRaised -= amountToWithdraw;
            contribution.amount = 0;

            emit ProjectFunded(projectId, msg.sender, 0);
            
            TOKEN.safeTransfer(msg.sender, amountToWithdraw);
        }
    }
}