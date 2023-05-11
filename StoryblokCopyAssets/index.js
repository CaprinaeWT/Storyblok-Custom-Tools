// const commander = require("commander");
// const { COMMANDS } = require("./constants/commands");
// const { loginWithToken, getStoryblokClient } = require("./utils/auth");
// const async = require("async");

import { Command } from "commander";
import SyncAssets from "./utils/syncAssets.js";

const program = new Command();

program
  .description("Sync Assets between spaces")
  .requiredOption("--token <TOKEN>", "Personal access token to login")
  .requiredOption("--region <REGION>", "Region of the user")
  .requiredOption("--source <SPACE_ID>", "Source space id")
  .requiredOption("--target <SPACE_ID>", "Target space id")
  .requiredOption("--starts-with <VALUE>", "starts with")
  .requiredOption(
    "--parent-folder-uuid <VALUE>",
    "UUID from the Asset parent folder"
  )
  .action(async (options) => {
    const { token, region, source, target, startsWith, parentFolderUuid } =
      options;

    try {
      const syncAssets = await new SyncAssets(
        token,
        region,
        source,
        target,
        startsWith,
        parentFolderUuid
      );

      syncAssets.start();
    } catch (e) {
      console.log(e);
    }
  });

program.parse();
