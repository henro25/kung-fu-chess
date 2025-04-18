// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var game_pb = require('./game_pb.js');

function serialize_game_GameState(arg) {
  if (!(arg instanceof game_pb.GameState)) {
    throw new Error('Expected argument of type game.GameState');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_game_GameState(buffer_arg) {
  return game_pb.GameState.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_game_JoinRequest(arg) {
  if (!(arg instanceof game_pb.JoinRequest)) {
    throw new Error('Expected argument of type game.JoinRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_game_JoinRequest(buffer_arg) {
  return game_pb.JoinRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_game_JoinResponse(arg) {
  if (!(arg instanceof game_pb.JoinResponse)) {
    throw new Error('Expected argument of type game.JoinResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_game_JoinResponse(buffer_arg) {
  return game_pb.JoinResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_game_MoveRequest(arg) {
  if (!(arg instanceof game_pb.MoveRequest)) {
    throw new Error('Expected argument of type game.MoveRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_game_MoveRequest(buffer_arg) {
  return game_pb.MoveRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_game_MoveResponse(arg) {
  if (!(arg instanceof game_pb.MoveResponse)) {
    throw new Error('Expected argument of type game.MoveResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_game_MoveResponse(buffer_arg) {
  return game_pb.MoveResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_game_StreamRequest(arg) {
  if (!(arg instanceof game_pb.StreamRequest)) {
    throw new Error('Expected argument of type game.StreamRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_game_StreamRequest(buffer_arg) {
  return game_pb.StreamRequest.deserializeBinary(new Uint8Array(buffer_arg));
}


// Service for managing Kung‑Fu Chess games
var GameServiceService = exports.GameServiceService = {
  // Player joins or creates a game
joinGame: {
    path: '/game.GameService/JoinGame',
    requestStream: false,
    responseStream: false,
    requestType: game_pb.JoinRequest,
    responseType: game_pb.JoinResponse,
    requestSerialize: serialize_game_JoinRequest,
    requestDeserialize: deserialize_game_JoinRequest,
    responseSerialize: serialize_game_JoinResponse,
    responseDeserialize: deserialize_game_JoinResponse,
  },
  // Player makes a move
makeMove: {
    path: '/game.GameService/MakeMove',
    requestStream: false,
    responseStream: false,
    requestType: game_pb.MoveRequest,
    responseType: game_pb.MoveResponse,
    requestSerialize: serialize_game_MoveRequest,
    requestDeserialize: deserialize_game_MoveRequest,
    responseSerialize: serialize_game_MoveResponse,
    responseDeserialize: deserialize_game_MoveResponse,
  },
  // Stream continuous updates of the game state
streamGameState: {
    path: '/game.GameService/StreamGameState',
    requestStream: false,
    responseStream: true,
    requestType: game_pb.StreamRequest,
    responseType: game_pb.GameState,
    requestSerialize: serialize_game_StreamRequest,
    requestDeserialize: deserialize_game_StreamRequest,
    responseSerialize: serialize_game_GameState,
    responseDeserialize: deserialize_game_GameState,
  },
};

exports.GameServiceClient = grpc.makeGenericClientConstructor(GameServiceService, 'GameService');
