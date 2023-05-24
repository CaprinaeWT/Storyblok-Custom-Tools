import Auth from "./auth.js";
import fs from "fs";
import FormData from "form-data";
import https from "https";
import chalk from "chalk";
import os from "os";
import path from "path";

export default class SyncAssets {
  constructor(
    authToken,
    region,
    sourceSpaceId,
    targetSpaceId,
    assetFolderName
  ) {
    this.authToken = authToken;
    this.region = region;
    this.sourceSpaceId = sourceSpaceId;
    this.targetSpaceId = targetSpaceId;
    this.assetFolderName = assetFolderName.toLowerCase();
    this.sourceAssetFolders = [];
    this.targetAssetFolders = [];
    this.allSourceAssetFolders = [];
    this.allTargetAssetFolders = [];
    this.targetAssetsFilenames = [];
    this.dir = "/tmp/storyblok-helper";
  }

  async start() {
    try {
      console.log(chalk.black.bgYellow(" o Fetching Storyblok client"));
      const auth = new Auth(this.authToken, this.region, this.targetSpaceId);
      this.storyblok = await auth.getStoryblokClient();

      console.log();
      await this.creatingTempFolder();

      console.log();
      await this.getStories();

      console.log();
      await this.syncSourceAssetFoldersToTarget();
      console.log();
      await this.getAssetFoldersTarget();

      console.log();
      console.log(chalk.black.bgYellow(" o "), "Finding parent folder ");
      const parentFolderSource = this.allSourceAssetFolders.find(
        (f) => f.name.toLowerCase() === this.assetFolderName
      );
      if (!parentFolderSource) {
        console.log(
          chalk.black.bgRedBright(" x "),
          ` Please double check the parent asset folder name `
        );
        throw "";
      }
      this.sourceAssetFolders.push(parentFolderSource);

      const parentFolderTarget = this.allTargetAssetFolders.find(
        (f) => f.name === parentFolderSource.name
      );
      if (!parentFolderTarget) {
        console.log(
          chalk.black.bgRedBright(" x "),
          ` Please double check the parent asset folder name `
        );
        throw "";
      }
      this.targetAssetFolders.push(parentFolderTarget);
      console.log(chalk.black.bgGreen(" ✓ "), "Parent folder has been found ");

      console.log();
      console.log(
        chalk.black.bgYellow(" o "),
        "Filter out all non child source folder of parent "
      );
      await this.getSourceFoldersChildrenAndGrandchildren(
        parentFolderSource.uuid,
        this.allSourceAssetFolders
      );
      console.log(
        chalk.black.bgGreen(" ✓ "),
        "Source asset folders filterd out "
      );

      console.log();
      console.log(
        chalk.black.bgYellow(" o "),
        "Filter out all non child target folder of parent "
      );
      await this.getTargetFoldersChildrenAndGrandchildren(
        parentFolderTarget.uuid,
        this.allTargetAssetFolders
      );
      console.log(
        chalk.black.bgGreen(" ✓ "),
        "Target asset folders filterd out "
      );

      console.log();
      await this.getAssetsFromSource();
      console.log();
      await this.getAssetsFromTarget();
      console.log();
      await this.uploadAssets();
      console.log();
      await this.replaceAssetsInStories();
      console.log();
      await this.saveStories();
    } catch (e) {
      console.log(
        chalk.black.bgRedBright(" x "),
        ` ${e.response}: Something went wrong `
      );
      console.log(e);
    }
  }

  creatingTempFolder() {
    console.log(
      chalk.black.bgYellow(" o "),
      "Creating tmp Folder if none exists"
    );

    if (!fs.existsSync(this.dir)) {
      try {
        fs.mkdirSync(this.dir);
        console.log(chalk.black.bgGreen(" ✓ "), "tmp Directory Created");
      } catch (err) {
        console.log(
          chalk.black.bgRedBright(" x "),
          `Error Creating Directory `
        );
        console.log(e);
        throw e;
      }
    }
    console.log(chalk.black.bgCyan(" - "), "tmp Directory already exists");
  }

  async getStories() {
    console.log(
      chalk.black.bgYellow(" o "),
      "Fetching stories from target space "
    );
    try {
      const targetStories = [];
      const storiesManagementRequests = [];
      //Get total of pages
      const targetSpaceStoriesrequest = await this.storyblok.get(
        "cdn/stories",
        {
          version: "draft",
          story_only: 1,
          per_page: 100,
          page: 1,
        }
      );
      const storyPagesTotal = Math.ceil(
        targetSpaceStoriesrequest.headers.total / 10
      );
      for (let i = 1; i <= storyPagesTotal; i++) {
        //fetch stories content
        targetStories.push(
          this.storyblok.get("cdn/stories", {
            version: "draft",
            per_page: 100,
            page: i,
          })
        );
        //fetch stories info like published status
        storiesManagementRequests.push(
          this.storyblok.get(`spaces/${this.targetSpaceId}/stories`, {
            version: "draft",
            per_page: 100,
            page: i,
          })
        );
      }
      //Wait for Promise
      const targetStoriesResponse = await Promise.all(targetStories);
      const targetStoriesManagementResponse = await Promise.all(
        storiesManagementRequests
      );
      //Flatten Data to only stories
      this.storiesList = targetStoriesResponse
        .map((r) => r.data.stories)
        .flat();
      this.storiesListManagement = targetStoriesManagementResponse
        .map((r) => r.data.stories)
        .flat();
      //Set publish status
      this.storiesList.forEach((story) => {
        let storyManagement = targetStoriesManagementResponse.find(
          (s) => s.uuid === story.uuid
        );
        if (storyManagement) {
          story.published = storyManagement.published;
          story.unpublished_changes = storyManagement.unpublished_changes;
        }
      });
      console.log(
        chalk.black.bgGreen(" ✓ "),
        "Stories fetched from target space "
      );
    } catch (e) {
      console.log(
        chalk.black.bgRedBright(" x "),
        `Error fetching the stories. `
      );
      console.log(e);
      throw e;
    }
  }

  async getAssetFoldersSource() {
    console.log(
      chalk.black.bgYellow(" o "),
      ` Fetching source space assets folders `
    );
    try {
      const assetsFolders = await this.storyblok.get(
        `spaces/${this.sourceSpaceId}/asset_folders`
      );

      this.allSourceAssetFolders = assetsFolders.data.asset_folders;

      console.log(chalk.black.bgGreen(" ✓ "), ` Source folders fetched `);
    } catch (e) {
      console.log(
        chalk.black.bgRedBright(" x "),
        ` ${e.response}: Double check the source space id `
      );
      throw e;
    }
  }

  async getAssetsFromSource() {
    console.log(
      chalk.black.bgYellow(" o "),
      "Fetching assets from source space"
    );
    try {
      const assetsRequests = [];

      for (const assetFolder of this.sourceAssetFolders) {
        console.log(
          chalk.black.bgCyan(" - "),
          `finding assets in: ${assetFolder.name}`
        );
        const assetsPageRequest = await this.storyblok.get(
          `spaces/${this.sourceSpaceId}/assets`,
          {
            per_page: 100,
            page: 1,
            in_folder: assetFolder.id,
          }
        );
        console.log(
          chalk.black.bgCyan(" - "),
          `Total of ${assetsPageRequest.headers.total} assets found`
        );
        if (assetsPageRequest.headers.total > 0) {
          const assetsPagesTotal = Math.ceil(
            assetsPageRequest.headers.total / 100
          );
          for (let i = 1; i <= assetsPagesTotal; i++) {
            assetsRequests.push({
              assets: await this.storyblok.get(
                `spaces/${this.sourceSpaceId}/assets`,
                {
                  per_page: 100,
                  page: i,
                  in_folder: assetFolder.id,
                }
              ),
              folder: this.targetAssetFolders.find(
                (folder) => folder.name === assetFolder.name
              ),
            });
          }
        }
      }
      const assetsResponses = await Promise.all(assetsRequests);
      this.assetsGroupList = assetsResponses.map((assetGroup) => {
        const assets = assetGroup.assets.data.assets
          .flat()
          .map((asset) => asset.filename);

        return {
          assetFolderId: assetGroup.folder.id,
          assets: assets,
          assetFolderName: assetGroup.folder.name,
        };
      });

      console.log(chalk.black.bgGreen(" ✓ "), "Assets from source Fetched ");
    } catch (e) {
      throw e;
    }
  }

  async getAssetsFromTarget() {
    console.log(
      chalk.black.bgYellow(" o "),
      "Fetching assets from target space "
    );
    try {
      const assetsRequests = [];
      for (const assetFolder of this.targetAssetFolders) {
        const assetsPageRequest = await this.storyblok.get(
          `spaces/${this.targetSpaceId}/assets`,
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
              await this.storyblok.get(`spaces/${this.targetSpaceId}/assets`, {
                per_page: 100,
                page: i,
                in_folder: assetFolder.id,
              })
            );
          }
        }
      }
      const assetsResponses = await Promise.all(assetsRequests);
      const targetAssets = assetsResponses
        .map((r) => r.data.assets)
        .flat()
        .map((asset) => asset.filename);

      for (const targetAsset of targetAssets) {
        const filedata = this.getAssetData(targetAsset);
        this.targetAssetsFilenames.push(filedata.filename);
      }
      console.log(chalk.black.bgGreen(" ✓ "), "Assets from target Fetched ");
    } catch (e) {
      throw e;
    }
  }

  async getAssetFoldersTarget() {
    console.log(
      chalk.black.bgYellow(" o "),
      ` Fetching target space assets folders `
    );
    try {
      const targetAssetsFoldersRequest = await this.storyblok.get(
        `spaces/${this.targetSpaceId}/asset_folders/`
      );

      this.allTargetAssetFolders =
        targetAssetsFoldersRequest.data.asset_folders;

      console.log(chalk.black.bgGreen(" ✓ "), ` Target folders fetched `);
    } catch (e) {
      console.log(
        chalk.black.bgRedBright(" x "),
        ` ${e.response}: Something went wrong `
      );
      throw e;
    }
  }

  async getTargetFoldersChildrenAndGrandchildren(parentUuid, parentFolders) {
    const childrenFolders = parentFolders.filter(
      (obj) => obj.parent_uuid === parentUuid
    );
    for (const child of childrenFolders) {
      this.targetAssetFolders.push(child);
      if (
        this.allTargetAssetFolders.find((f) => f.parent_uuid === child.uuid)
      ) {
        this.getTargetFoldersChildrenAndGrandchildren(
          child.uuid,
          this.allTargetAssetFolders
        );
      }
    }
  }

  async getSourceFoldersChildrenAndGrandchildren(parentUuid, parentFolders) {
    const childrenFolders = parentFolders.filter(
      (obj) => obj.parent_uuid === parentUuid
    );
    for (const child of childrenFolders) {
      this.sourceAssetFolders.push(child);
      if (
        this.allSourceAssetFolders.find((f) => f.parent_uuid === child.uuid)
      ) {
        this.getSourceFoldersChildrenAndGrandchildren(
          child.uuid,
          this.allSourceAssetFolders
        );
      }
    }
  }

  async syncSourceAssetFoldersToTarget() {
    console.log(
      chalk.black.bgYellow(" o "),
      "Copy over source asset folders to target "
    );
    try {
      await this.getAssetFoldersSource();
      await this.getAssetFoldersTarget();

      console.log(
        chalk.black.bgYellow(" o "),
        ` Creating asset folders on target space `
      );
      for (const sourceFolder of this.allSourceAssetFolders) {
        this.createFolder(sourceFolder);
      }
      console.log(chalk.black.bgGreen(" ✓ "), ` Asset folders created `);

      await this.getAssetFoldersTarget();

      console.log(
        chalk.black.bgYellow(" o "),
        ` Updating parent asset folders on target space `
      );
      for (const sourceFolder of this.allSourceAssetFolders) {
        this.updateFolder(sourceFolder);
      }
      console.log(chalk.black.bgGreen(" ✓ "), ` Parent asset folders updated `);
      console.log(
        chalk.black.bgGreen(
          " ✓ Source asset folder are copied over to target space "
        )
      );
    } catch (e) {
      console.log(
        chalk.black.bgRedBright(" x "),
        ` ${e.response}: Something went wrong`
      );
      throw e;
    }
  }

  async createFolder(folder) {
    if (this.allTargetAssetFolders.find((f) => f.name === folder.name)) {
      return;
    }
    await this.storyblok.post(`spaces/${this.targetSpaceId}/asset_folders`, {
      name: folder.name,
    });
  }

  async updateFolder(folder) {
    const sourceParentFolder = this.allSourceAssetFolders.find(
      (f) => f.id === folder.parent_id
    );
    if (!sourceParentFolder) {
      return;
    }

    const targetParentFolder = this.allTargetAssetFolders.find(
      (f) => f.name === sourceParentFolder.name
    );
    if (!targetParentFolder) {
      return;
    }

    const targetChildFolder = this.allTargetAssetFolders.find(
      (f) => f.name === folder.name
    );
    if (!targetChildFolder) {
      return;
    }

    await this.storyblok.put(
      `spaces/${this.targetSpaceId}/asset_folders/${targetChildFolder.id}`,
      {
        parent_id: targetParentFolder.id,
      }
    );
  }

  async uploadAssets() {
    this.assets = [];
    console.log(
      chalk.black.bgYellow(" o "),
      "Uploading assets to target space "
    );
    try {
      for (const assetsList of this.assetsGroupList) {
        for (const asset of assetsList.assets) {
          const assetUrl = asset.replace("s3.amazonaws.com/", "");

          console.log(
            chalk.black.bgCyan(" - "),
            `Uploading asset: ${assetUrl} `
          );
          console.log(
            chalk.black.bgCyan(" - "),
            `To folder: ${assetsList.assetFolderName} `
          );
          this.assets.push({
            original_url: assetUrl,
            asset_folder_id: assetsList.assetFolderId,
          });
          await this.uploadAsset(assetUrl, assetsList.assetFolderId);
        }
      }
    } catch (e) {
      throw e;
    }
  }

  async uploadAsset(asset, assetFolderId) {
    const assetData = this.getAssetData(asset);

    if (this.targetAssetsFilenames.includes(assetData.filename)) {
      console.log(chalk.black.bgCyan(" - "), "Assets Already exists ");
      return;
    }

    try {
      console.log(chalk.black.bgCyan(" - "), "Downloading asset locally ");
      await this.downloadAsset(assetData, asset);
      let newAssetPayload = {
        filename: assetData.filename,
        size: assetData.dimensions,
        asset_folder_id: assetFolderId,
      };

      console.log(chalk.black.bgCyan(" - "), "Post asset to target space ");
      const newAssetRequest = await this.storyblok.post(
        `spaces/${this.targetSpaceId}/assets`,
        newAssetPayload
      );
      if (newAssetRequest.status != 200) {
        return resolve({ success: false });
      }

      const signedRequest = newAssetRequest.data;
      let form = new FormData();
      for (let key in signedRequest.fields) {
        form.append(key, signedRequest.fields[key]);
      }
      form.append("file", fs.createReadStream(assetData.filepath));

      return new Promise((resolve) => {
        form.submit(signedRequest.post_url, (err) => {
          if (
            fs.existsSync(assetData.filepath) ||
            fs.existsSync(assetData.folder)
          ) {
            fs.rmSync(assetData.folder, { recursive: true });
          }
          if (err) {
            resolve({ success: false });
          } else {
            this.assets = this.assets.map((item) => {
              if (item.original_url === asset) {
                return { ...item, new_url: signedRequest.pretty_url };
              }
              return item;
            });

            this.storyblok
              .get(
                `spaces/${this.targetSpaceId}/assets/${signedRequest.id}/finish_upload`
              )
              .then(() => {
                resolve({ success: true });
              })
              .catch(() => {
                resolve({ success: false });
              });
          }
        });
        console.log(chalk.black.bgGreen(" ✓ Asset uploaded "));
      });
    } catch (err) {
      if (
        err.config?.url === `/spaces/${this.targetSpaceId}/assets` &&
        (err.code === "ECONNABORTED" || err.message.includes("429"))
      ) {
        if (this.assetsRetries[asset] > this.retriesLimit) {
          return { success: false };
        } else {
          if (!this.assetsRetries[asset]) {
            this.assetsRetries[asset] = 1;
          } else {
            ++this.assetsRetries[asset];
          }
          return this.uploadAsset(asset);
        }
      } else {
        return { success: false };
      }
    }
  }

  getAssetData(url) {
    const urlParts = url.replace("https://a.storyblok.com/f/", "").split("/");
    const dimensions = urlParts.length === 4 ? urlParts[1] : "";

    return {
      filename: url.split("?")[0].split("/").pop(),
      folder: `${this.dir}/${url.split("?")[0].split("/").slice(0, -1).pop()}`,
      filepath: `${this.dir}/${url
        .split("?")[0]
        .split("/")
        .slice(0, -1)
        .pop()}/${url.split("?")[0].split("/").pop()}`,
      ext: url.split("?")[0].split("/").pop().split(".").pop(),
      dimensions: dimensions,
    };
  }

  async downloadAsset(assetData, url) {
    if (!fs.existsSync(assetData.folder)) {
      fs.mkdirSync(assetData.folder);
    }
    const file = fs.createWriteStream(assetData.filepath);
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          res.pipe(file);
          file.on("finish", function () {
            file.close(resolve(true));
          });
        })
        .on("error", () => {
          console.error(reject(false));
        });
    });
  }

  async replaceAssetsInStories() {
    console.log(
      chalk.black.bgYellow(" o "),
      "Replace assets in stories from target space "
    );
    this.updatedStories = this.storiesList.slice(0);

    for (const asset of this.assets) {
      const assetUrlReg = new RegExp(
        asset.original_url.replace("https:", "").replace("http:", ""),
        "g"
      );

      console.log(
        chalk.black.bgCyan(" - "),
        `Replacing: ${asset.original_url}`
      );
      console.log(chalk.black.bgCyan(" - "), `With: ${asset.new_url}`);
      if (asset.new_url) {
        this.updatedStories = JSON.parse(
          JSON.stringify(this.updatedStories).replace(
            assetUrlReg,
            asset.new_url
          )
        );
      }
    }
    console.log(chalk.black.bgGreen(" ✓ Asset replaces in stories "));
  }

  async saveStories() {
    console.log(chalk.black.bgYellow(" o ", "Saving stories "));
    let total = 0;
    const storiesWithUpdates = this.updatedStories.filter((story) => {
      const originalStory = this.storiesList.find((s) => s.id === story.id);
      return (
        JSON.stringify(originalStory.content) !== JSON.stringify(story.content)
      );
    });

    const migrationResult = await Promise.allSettled(
      storiesWithUpdates.map(async (story) => {
        const originalStory = this.storiesList.find((s) => s.id === story.id);
        delete story.content._editable;
        let postData = { story };
        if (story.published && !story.unpublished_changes) {
          post_data.publish = 1;
        }
        try {
          await this.storyblok.put(
            `spaces/${this.targetSpaceId}/stories/${story.id}`,
            postData
          );
          return true;
        } catch (err) {
          return false;
        }
      })
    );

    console.log(
      chalk.black.bgGreen(" ✓ Completed "),
      `${
        migrationResult.filter((r) => r.status === "fulfilled" && r.value)
          .length
      } ${
        migrationResult.filter((r) => r.status === "fulfilled" && r.value)
          .length === 1
          ? "story"
          : "stories"
      } updated.`
    );
  }
}
