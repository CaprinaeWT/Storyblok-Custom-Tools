import Auth from "./auth.js";
import fs from "fs";
import FormData from "form-data";
import https from "https";
import chalk from "chalk";

export default class DeleteAssets {
  constructor(authToken, region, spaceId, startsWith) {
    this.authToken = authToken;
    this.region = region;
    this.spaceId = spaceId;
    this.startsWith = startsWith.toLowerCase();
    this.allAssetFolders = [];
    this.folders = [];
    this.assets = [];
  }

  async start() {
    try {
      console.log(chalk.black.bgYellow(" o Fetching Storyblok client"));
      const auth = new Auth(this.authToken, this.region, this.spaceId);
      this.storyblok = await auth.getStoryblokClient();

      console.log();
      await this.getAllAssetFolders();

      console.log();
      await this.getParentAssetFolder();

      console.log();
      console.log(
        chalk.black.bgYellow(" o "),
        `Finding all children folders under: ${this.startsWith}`
      );
      await this.getParentFoldersChildrenAndGrandchildren(
        this.parentAssetFolder.uuid
      );
      console.log(chalk.black.bgGreen(" ✓ "), `Children folders found`);

      console.log();
      await this.getAssets();

      console.log();
      await this.removeAssets();

      console.log();
      await this.removeAssetsFolders();
    } catch (e) {
      console.log(chalk.black.bgRedBright(" x Something went wrong "));
      console.log(e);
    }
  }

  async getAllAssetFolders() {
    console.log(chalk.black.bgYellow(" o "), ` Fetching assets folders`);
    try {
      const assetsFolders = await this.storyblok.get(
        `spaces/${this.spaceId}/asset_folders`
      );

      this.allAssetFolders = assetsFolders.data.asset_folders;

      console.log(chalk.black.bgGreen(" ✓ "), `Asset Folders fetched `);
    } catch (e) {
      console.log(
        chalk.black.bgRedBright(" x "),
        ` ${e.response}: Double check the space id`
      );
      throw e;
    }
  }

  async getParentAssetFolder() {
    console.log(
      chalk.black.bgYellow(" o "),
      `Finding folder that starts with ${this.startsWith}`
    );

    this.parentAssetFolder = this.allAssetFolders.find(
      (f) => f.name.toLowerCase() === this.startsWith
    );

    if (!this.parentAssetFolder) {
      throw "No parent folder found";
    }

    this.folders.push(this.parentAssetFolder);
    console.log(chalk.black.bgGreen(" ✓ "), `Parent folder found `);
  }

  async getParentFoldersChildrenAndGrandchildren(parentUuid) {
    const childrenFolders = this.allAssetFolders.filter(
      (obj) => obj.parent_uuid === parentUuid
    );
    for (const child of childrenFolders) {
      console.log(chalk.black.bgCyan(" - "), ` Child folder: ${child.name}`);
      this.folders.push(child);
      if (this.allAssetFolders.find((f) => f.parent_uuid === child.uuid)) {
        this.getParentFoldersChildrenAndGrandchildren(child.uuid);
      }
    }
  }

  async getAssets() {
    console.log(chalk.black.bgYellow(" o "), "Fetching assets ");
    try {
      const assetsRequests = [];
      for (const assetFolder of this.folders) {
        const assetsPageRequest = await this.storyblok.get(
          `spaces/${this.spaceId}/assets`,
          {
            per_page: 100,
            page: 1,
            in_folder: assetFolder.id,
          }
        );
        if (assetsPageRequest.headers.total > 0) {
          const assetsPagesTotal = Math.ceil(
            assetsPageRequest.headers.total / 100
          );
          for (let i = 1; i <= assetsPagesTotal; i++) {
            assetsRequests.push(
              await this.storyblok.get(`spaces/${this.spaceId}/assets`, {
                per_page: 100,
                page: i,
                in_folder: assetFolder.id,
              })
            );
          }
        }
      }
      const assetsResponses = await Promise.all(assetsRequests);
      this.assets = assetsResponses.map((r) => r.data.assets).flat();

      console.log(chalk.black.bgGreen(" ✓ "), "Assets from source Fetched ");
    } catch (e) {
      throw e;
    }
  }

  async removeAssets() {
    console.log(chalk.black.bgYellow(" o "), "Removing assets ");
    for (const asset of this.assets) {
      console.log(chalk.black.bgCyan(" - "), `Removing: ${asset.filename} `);
      try {
        await this.storyblok.delete(
          `spaces/${this.spaceId}/assets/${asset.id}`
        );
      } catch (e) {
        throw e;
      }
      console.log(
        chalk.black.bgGreen(" ✓ "),
        `Successfully Removed: ${asset.filename} `
      );
    }
    console.log(chalk.black.bgGreen(" ✓ "), "Assets removed ");
  }

  async removeAssetsFolders() {
    console.log(chalk.black.bgYellow(" o "), "Removing asset folders ");
    for (const folder of this.folders) {
      console.log(chalk.black.bgCyan(" - "), `Removing: ${folder.name} `);
      try {
        await this.storyblok.delete(
          `spaces/${this.spaceId}/asset_folders/${folder.id}`
        );
      } catch (e) {
        throw e;
      }
      console.log(
        chalk.black.bgGreen(" ✓ "),
        `Successfully Removed: ${folder.name} `
      );
    }
    console.log(chalk.black.bgGreen(" ✓ "), "Asset folders removed ");
  }
}
