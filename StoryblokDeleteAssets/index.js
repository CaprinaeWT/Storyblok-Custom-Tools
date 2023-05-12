import { Command } from "commander";
import DeleteAssets from "./utils/deleteAssets.js";

const program = new Command();

program
  .description("Delete Assets between spaces")
  .requiredOption("--token <TOKEN>", "Personal access token to login")
  .requiredOption("--region <REGION>", "Region of the user")
  .requiredOption("--space-id <SPACE_ID>", "Target space id")
  .requiredOption("--starts-with <VALUE>", "starts with")
  .action(async (options) => {
    const { token, region, spaceId, startsWith } = options;

    try {
      const deleteAssets = await new DeleteAssets(
        token,
        region,
        spaceId,
        startsWith
      );

      deleteAssets.start();
    } catch (e) {
      console.log(e);
    }
  });

program.parse();
