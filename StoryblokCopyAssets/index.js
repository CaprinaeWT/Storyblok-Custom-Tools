import { Command } from "commander";
import SyncAssets from "./utils/syncAssets.js";

const program = new Command();

program
  .description("Sync Assets between spaces")
  .requiredOption("--token <TOKEN>", "Personal access token to login")
  .requiredOption("--region <REGION>", "Region of the user")
  .requiredOption("--source <SPACE_ID>", "Source space id")
  .requiredOption("--target <SPACE_ID>", "Target space id")
  .requiredOption("--stories-starts-with <VALUE>", "starts with")
  .requiredOption(
    "--asset-folder-name <VALUE>",
    "Name from the Asset parent folder"
  )
  .action(async (options) => {
    const {
      token,
      region,
      source,
      target,
      storiesStartsWith,
      assetFolderName,
    } = options;

    try {
      const syncAssets = await new SyncAssets(
        token,
        region,
        source,
        target,
        storiesStartsWith,
        assetFolderName
      );

      syncAssets.start();
    } catch (e) {
      console.log(e);
    }
  });

program.parse();
