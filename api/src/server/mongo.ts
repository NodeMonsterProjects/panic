import { MongoClient, MongoClientOptions } from "mongodb";
import { MongoClientNotInitialised } from "../constant/errors";
import {
  MSG_MONGO_CONNECTION_ESTABLISHED,
  MSG_MONGO_COULD_NOT_DISCONNECT,
  MSG_MONGO_COULD_NOT_ESTABLISH_CONNECTION,
  MSG_MONGO_DISCONNECTED,
} from "../constant/msg";

export const MonitorablesCollection = "monitorables";

export class MongoInterface {
  private readonly url: string;
  private readonly options: MongoClientOptions;
  private _client?: MongoClient;

  constructor(
    options: MongoClientOptions,
    host: string = "localhost",
    port: number = 27017
  ) {
    this.options = options;
    this.options.readPreference = "primaryPreferred";
    this.options.replicaSet = "replica-set";

    this.url = `mongodb://rs1:${port},rs2:${port},rs3:${port}`;
    this._client = undefined;
  }

  get client() {
    return this._client;
  }

  async connect() {
    if (this._client) {
      return;
    }
    try {
      this._client = await MongoClient.connect(this.url, this.options);
      console.log(MSG_MONGO_CONNECTION_ESTABLISHED);
    } catch (err) {
      console.error(MSG_MONGO_COULD_NOT_ESTABLISH_CONNECTION);
      console.error(err);
    }
  }

  async disconnect() {
    if (this._client) {
      try {
        await this._client.close();
        console.log(MSG_MONGO_DISCONNECTED);
      } catch (err) {
        console.error(MSG_MONGO_COULD_NOT_DISCONNECT);
        console.error(err);
      }
    } else {
      throw new MongoClientNotInitialised();
    }
  }
}
