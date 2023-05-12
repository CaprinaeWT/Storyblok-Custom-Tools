import StoryblokClient from "storyblok-js-client";
import chalk from "chalk";

export default class Auth {
  constructor(authToken, region, targetSpace) {
    this.authToken = authToken;
    this.region = region;
    this.targetSpace = targetSpace;
  }

  async getStoryblokClient() {
    let storyblokClient = new StoryblokClient({
      accessToken: this.spaceAccessToken ? this.spaceAccessToken : "",
      oauthToken: this.authToken,
      region: this.region,
    });

    try {
      const targetSpace = await storyblokClient.get(
        `spaces/${this.targetSpace}`
      );

      storyblokClient = await new StoryblokClient({
        accessToken: targetSpace.data.space.first_token
          ? targetSpace.data.space.first_token
          : "",
        oauthToken: this.authToken,
        region: this.region,
      });

      console.log(chalk.black.bgGreen(" ✓ Client fetched"));
      return storyblokClient;
    } catch (e) {
      if (e.status === 404) {
        console.log(
          chalk.black.bgRedBright(" x "),
          ` ${e.response}: Double check the space id`
        );
      } else if (e.status === 401) {
        console.log(
          chalk.black.bgRedBright(" x "),
          ` ${e.response}: Double check the personal access token `
        );
      } else {
        console.log(
          chalk.black.bgRedBright(" x "),
          ` ${e.response}: Something went wrong`
        );
      }

      throw e;
    }
  }
}
